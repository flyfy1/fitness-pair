import { assertPoseFrame, assertActionFrame, sameSource } from '@fitness-pair/contracts';

export const RECOGNIZER_ID = 'jump-height-2d/1';
const STANDING_MS = 1500;
const LANDING_MS = 200;
const LOSS_MS = 750;
const NOISE_GRACE_MS = 350;
const FLIGHT_TIMEOUT_MS = 2500;
const MAXIMUM_WAIT_MS = 15000;
const clamp = value => Math.max(0, Math.min(1, value));
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const upperJoints = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'];
const lowerJoints = ['leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];
const usable = (joints, names) => names.every(name => joints[name] && joints[name].confidence !== null
  && joints[name].confidence >= .6 && joints[name].x >= .015 && joints[name].x <= .985
  && joints[name].y >= .015 && joints[name].y <= .985);

function geometry(frame, mode) {
  const joints = frame.joints;
  if (!usable(joints, upperJoints) || mode === 'full-body' && !usable(joints, lowerJoints)) return null;
  const aspect = frame.image.width / frame.image.height;
  const distance = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const kneeAngle = (hip, knee, ankle) => {
    const a = distance(hip, knee), b = distance(knee, ankle), c = distance(hip, ankle);
    if (!a || !b) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b)))) * 180 / Math.PI;
  };
  const upright = ['left', 'right'].every(side => {
    const shoulder = joints[`${side}Shoulder`], hip = joints[`${side}Hip`];
    const knee = joints[`${side}Knee`], ankle = joints[`${side}Ankle`];
    const torsoUpright = shoulder.y + .08 < hip.y
      && Math.abs(shoulder.x - hip.x) * aspect < (hip.y - shoulder.y) * .7;
    return torsoUpright && (mode === 'upper-body' || hip.y + .06 < knee.y
      && knee.y + .06 < ankle.y && kneeAngle(hip, knee, ankle) > 155);
  });
  return {
    hipY: average([joints.leftHip.y, joints.rightHip.y]),
    shoulderY: average([joints.leftShoulder.y, joints.rightShoulder.y]),
    shoulderWidth: distance(joints.leftShoulder, joints.rightShoulder),
    hipWidth: distance(joints.leftHip, joints.rightHip),
    ...(mode === 'full-body' ? { leftAnkleY: joints.leftAnkle.y, rightAnkleY: joints.rightAnkle.y } : {}),
    torso: average(['left', 'right'].map(side => distance(joints[`${side}Shoulder`], joints[`${side}Hip`]))),
    centerX: average([joints.leftHip.x, joints.rightHip.x]), upright,
  };
}

/** Relative image displacement only: no camera, recording, or model-specific joints. */
export class JumpHeightRecognizer {
  constructor({ manualMaximum = false, preferUpperBody = false, quickStart = false, robustTracking = false } = {}) {
    this.manualMaximum = manualMaximum; this.preferUpperBody = preferUpperBody;
    this.quickStart = quickStart; this.robustTracking = robustTracking;
    this.configuredRange = null;
  }

  get canConfirmMaximum() {
    return this.stage === 'maximum' && (this.configuredRange !== null || this.measuredRise >= Math.max(.015, (this.baseline?.torso ?? 0) * .06))
      && this.confirmGroundedSince !== null && this.lastTMs - this.confirmGroundedSince >= LANDING_MS;
  }

  setJumpRange(torsoRatio) {
    if (!Number.isFinite(torsoRatio) || torsoRatio < .1 || torsoRatio > .8) {
      throw new RangeError('Jump range must be between 0.1 and 0.8 torso lengths');
    }
    if (!this.manualMaximum || this.stage === 'ready') return false;
    this.configuredRange = torsoRatio;
    return true;
  }

  confirmMaximum() {
    if (!this.manualMaximum || !this.canConfirmMaximum) return false;
    this.peakRise = this.configuredRange === null ? this.measuredRise : this.baseline.torso * this.configuredRange; this.stage = 'ready';
    this.flight = null; this.landingSince = null; this.filteredRise = 0;
    this.armed = true; return true;
  }

  reset({ sessionId, source }) {
    this.sessionId = sessionId;
    this.source = { ...source };
    this.lastSeq = -1; this.lastTMs = -1; this.modelId = null;
    this.repIndex = 0; this.imageKey = null;
    this.recalibrate();
  }

  recalibrate() {
    this.rejectedSince = null; this.riseSamples = [0, 0];
    this.stage = 'standing'; this.baseline = null; this.peakRise = null;
    this.measuredRise = 0; this.confirmGroundedSince = null;
    this.trackingMode = null; this.lowerAbsentSince = null; this.fallbackAnchor = null;
    this.standingSince = null; this.standingAnchor = null; this.standingSamples = [];
    this.flight = null; this.landingSince = null; this.lastValidTMs = null;
    this.filteredRise = 0; this.filterTMs = null; this.driftSince = null;
    this.maximumSince = null; this.retryMaximum = false; this.armed = false; this.rearmSince = null;
  }

  output(frame, { phase, cue, quality = 'tracked', ratio = 0, calibrationProgress = null, completion = null }) {
    const calibrated = this.stage === 'ready';
    const heightRatio = calibrated && phase !== 'missing' ? clamp(ratio) : 0;
    const result = {
      version: 1, sessionId: frame.sessionId, inputSeq: frame.seq, tMs: frame.tMs,
      source: { ...frame.source }, recognizerId: RECOGNIZER_ID, action: 'jump-height',
      phase, progress: heightRatio, calibrationProgress, cue, completion,
      stage: this.stage, calibrated, heightRatio, peakRise: this.peakRise, quality, trackingMode: this.trackingMode,
      measuredRise: this.measuredRise, canConfirmMaximum: this.canConfirmMaximum,
      ...(this.configuredRange !== null ? { rangeSource: 'slider',
        previewHeightRatio: phase === 'missing' || !this.baseline ? 0
          : clamp(this.filteredRise / (this.baseline.torso * this.configuredRange)) } : {}),
      ...(this.robustTracking ? { trackingReason: quality === 'tracking-grace' ? this.rejectionReason : null } : {}),
    };
    assertActionFrame(result);
    return result;
  }

  rejectNoise(frame, reason) {
    this.rejectedSince ??= this.lastValidTMs ?? frame.tMs;
    this.rejectionReason = reason; this.riseSamples = [0, 0];
    this.confirmGroundedSince = null; this.landingSince = null;
    // Keep measured state, but never credit an unseen landing, stance or peak.
    if (frame.tMs - this.rejectedSince <= NOISE_GRACE_MS) {
      return this.output(frame, { phase: 'missing', cue: 'hold-tracking', quality: 'tracking-grace' });
    }
    this.flight = null; this.armed = false; this.rearmSince = null;
    this.filteredRise = 0; this.filterTMs = null; this.riseSamples = [0, 0];
    this.standingSince = null; this.standingAnchor = null; this.standingSamples = [];
    if (frame.tMs - this.rejectedSince > LOSS_MS) this.recalibrate();
    return this.output(frame, { phase: 'missing', cue: 'move-back-into-frame', quality: reason });
  }

  recoverNoise(frame) {
    if (this.rejectedSince !== null && frame.tMs - this.rejectedSince > NOISE_GRACE_MS) {
      this.flight = null; this.armed = false; this.rearmSince = null;
      this.filteredRise = 0; this.filterTMs = null; this.riseSamples = [0, 0];
      this.standingSince = null; this.standingAnchor = null; this.standingSamples = [];
    }
    if (this.rejectedSince !== null && this.standingSince !== null) {
      this.standingSince += frame.tMs - this.rejectedSince;
    }
    this.rejectedSince = null;
    this.lastValidTMs = frame.tMs;
  }

  update(frame) {
    assertPoseFrame(frame);
    if (!this.source || frame.sessionId !== this.sessionId || !sameSource(frame.source, this.source)) {
      throw new Error('Reset recognizer before changing session or source');
    }
    if (frame.seq <= this.lastSeq || frame.tMs <= this.lastTMs) return null;
    if (this.modelId && this.modelId !== frame.modelId) throw new Error('Model change requires a new session');
    this.modelId = frame.modelId; this.lastSeq = frame.seq; this.lastTMs = frame.tMs;
    const imageKey = `${frame.image.width}:${frame.image.height}`;
    if (this.imageKey && this.imageKey !== imageKey) this.recalibrate();
    this.imageKey = imageKey;
    const fullPose = this.preferUpperBody ? null : geometry(frame, 'full-body');
    const upperPose = geometry(frame, 'upper-body');
    // A stable visible torso can recover cropped legs, but the signals need their
    // own standing and maximum calibrations. Never carry flight/peak across modes.
    if (this.trackingMode === 'full-body' && !fullPose && upperPose?.upright) {
      const anchor = this.fallbackAnchor;
      if (!anchor || Math.abs(upperPose.hipY - anchor.hipY) > .012
        || Math.abs(upperPose.shoulderY - anchor.shoulderY) > .012
        || Math.abs(upperPose.centerX - anchor.centerX) > .015
        || Math.abs(upperPose.torso / anchor.torso - 1) > .08) {
        this.lowerAbsentSince = frame.tMs; this.fallbackAnchor = upperPose;
      }
      if (frame.tMs - this.lowerAbsentSince >= LOSS_MS) {
        this.recalibrate(); this.trackingMode = 'upper-body';
      }
    } else {
      this.lowerAbsentSince = null; this.fallbackAnchor = null;
    }
    if (this.lastValidTMs !== null && frame.tMs - this.lastValidTMs > LOSS_MS) {
      // Preserve a pending stable-torso hold instead of switching on a moving
      // cropped pose merely because full-body tracking timed out.
      if (this.lowerAbsentSince !== null) {
        this.baseline = null; this.peakRise = null; this.stage = 'standing';
      } else this.recalibrate();
    }
    if (this.trackingMode === null || this.stage === 'standing' && this.lowerAbsentSince === null
      && this.trackingMode === 'upper-body' && fullPose) {
      const mode = fullPose ? 'full-body' : upperPose ? 'upper-body' : null;
      if (mode !== this.trackingMode) {
        this.standingSince = null; this.standingAnchor = null; this.standingSamples = [];
      }
      this.trackingMode = mode;
    }
    const pose = this.trackingMode === 'full-body' ? fullPose : upperPose;
    if (!pose) {
      if (this.robustTracking) return this.rejectNoise(frame, 'tracking-lost');
      this.confirmGroundedSince = null;
      // A lost interval cannot provide evidence of a landing or stable standing.
      this.flight = null; this.landingSince = null; this.armed = false; this.rearmSince = null;
      this.standingSince = null; this.standingAnchor = null; this.standingSamples = [];
      this.filterTMs = null; this.filteredRise = 0;
      return this.output(frame, { phase: 'missing', cue: 'move-back-into-frame', quality: 'tracking-lost' });
    }
    if (!this.robustTracking) this.lastValidTMs = frame.tMs;
    if (this.stage === 'standing') return this.stand(frame, pose);

    const baseline = this.baseline;
    const upperBody = this.trackingMode === 'upper-body';
    const scaleChanged = Math.abs(pose.torso / baseline.torso - 1) > (upperBody ? .12 : .2)
      || upperBody && !this.quickStart && !this.robustTracking && (Math.abs(pose.shoulderWidth / baseline.shoulderWidth - 1) > .12
        || Math.abs(pose.hipWidth / baseline.hipWidth - 1) > .12);
    const bentTorso = upperBody && !pose.upright;
    const movedSideways = Math.abs(pose.centerX - baseline.centerX) > .12;
    const movedDown = upperBody ? false
      : Math.min(pose.leftAnkleY - baseline.leftAnkleY, pose.rightAnkleY - baseline.rightAnkleY) > .045;
    // A countermovement lowers both anchors and can tilt/foreshorten the torso.
    // Keep the original standing reference; rising out of a squat is not a jump.
    const hipDrop = pose.hipY - baseline.hipY, shoulderDrop = pose.shoulderY - baseline.shoulderY;
    const preparingJump = hipDrop >= -.005 && shoulderDrop >= -.005
      && Math.max(hipDrop, shoulderDrop) > Math.max(.012, baseline.torso * .04)
      && pose.torso / baseline.torso >= .45 && pose.torso / baseline.torso <= 1.4
      && Math.abs(pose.shoulderWidth / baseline.shoulderWidth - 1) <= .15
      && Math.abs(pose.hipWidth / baseline.hipWidth - 1) <= .15
      && !movedSideways && (upperBody || Math.abs(pose.leftAnkleY - baseline.leftAnkleY) < .025
        && Math.abs(pose.rightAnkleY - baseline.rightAnkleY) < .025);
    if (movedSideways || movedDown || !preparingJump && (scaleChanged || bentTorso)) {
      if (this.robustTracking) return this.rejectNoise(frame, 'position-changed');
      this.confirmGroundedSince = null;
      this.driftSince ??= frame.tMs;
      this.flight = null; this.landingSince = null; this.armed = false;
      this.filterTMs = null; this.filteredRise = 0;
      if (frame.tMs - this.driftSince >= 400) this.recalibrate();
      return this.output(frame, { phase: 'missing', cue: 'rebaseline', quality: 'position-changed' });
    }
    if (this.robustTracking) this.recoverNoise(frame);
    this.driftSince = null;
    const hipRise = baseline.hipY - pose.hipY;
    const leftRise = upperBody ? baseline.shoulderY - pose.shoulderY : baseline.leftAnkleY - pose.leftAnkleY;
    const rightRise = upperBody ? hipRise : baseline.rightAnkleY - pose.rightAnkleY;
    // Visible feet must both rise in full-body mode. With cropped legs, coherent
    // shoulder and hip rise controls relative motion, without claiming takeoff.
    let rawRise = Math.max(0, Math.min(hipRise, leftRise, rightRise));
    if (this.robustTracking) {
      // Three observed samples suppress an isolated coherent pose spike. Missing
      // frames never enter this window and cannot invent height evidence.
      this.riseSamples.push(rawRise); this.riseSamples = this.riseSamples.slice(-3);
      rawRise = [...this.riseSamples].sort((a, b) => a - b)[1];
    }
    const alpha = this.filterTMs === null ? 1 : 1 - Math.exp(-(frame.tMs - this.filterTMs) / 35);
    this.filteredRise += alpha * (rawRise - this.filteredRise);
    this.filterTMs = frame.tMs;
    const liftThreshold = Math.max(this.quickStart ? .012 : .008, baseline.torso * .035);
    const landThreshold = Math.max(.005, baseline.torso * .025);
    const airborne = rawRise > liftThreshold;
    const grounded = (!this.robustTracking || rawRise <= landThreshold) && leftRise <= landThreshold && rightRise <= landThreshold && hipRise <= liftThreshold;
    if (grounded && !preparingJump && pose.upright && hipRise >= -liftThreshold) this.confirmGroundedSince ??= frame.tMs;
    else this.confirmGroundedSince = null;

    if (!this.armed) {
      this.rearmSince ??= frame.tMs;
      if (grounded) this.landingSince ??= frame.tMs;
      else this.landingSince = null;
      if (this.landingSince !== null && frame.tMs - this.landingSince >= LANDING_MS) {
        this.armed = true; this.landingSince = null; this.rearmSince = null;
      }
      if (!this.armed) {
        if (frame.tMs - this.rearmSince > FLIGHT_TIMEOUT_MS) {
          this.recalibrate();
          return this.output(frame, { phase: 'calibrating', cue: 'rebaseline', quality: 'position-changed', calibrationProgress: 0 });
        }
        return this.output(frame, { phase: 'missing', cue: 'land-and-hold', quality: 'tracking-lost' });
      }
    }
    if (this.armed && airborne && !this.flight) {
      this.flight = { started: frame.tMs, peak: 0, samples: 0 };
      this.retryMaximum = false;
    }
    if (this.flight) {
      this.flight.peak = Math.max(this.flight.peak, this.filteredRise);
      if (airborne) this.flight.samples++;
      if (this.quickStart && this.stage === 'maximum' && airborne && this.flight.samples >= 2
        && frame.tMs - this.flight.started >= 60) {
        // A coherent lift opens the game immediately. Scale gameplay from body
        // geometry, not a personal maximum or an unfinished jump's peak.
        this.peakRise = Math.max(.04, baseline.torso * .5); this.stage = 'ready';
        return this.output(frame, { phase: 'active', cue: 'jumping', ratio: this.filteredRise / this.peakRise });
      }
      if (this.stage === 'maximum' && this.manualMaximum && this.flight.samples >= 2
        && frame.tMs - this.flight.started >= 60) {
        this.measuredRise = Math.max(this.measuredRise, this.flight.peak);
      }
      if (grounded) this.landingSince ??= frame.tMs;
      else this.landingSince = null;
      if (this.landingSince !== null && frame.tMs - this.landingSince >= LANDING_MS) {
        const flight = this.flight;
        this.flight = null; this.landingSince = null; this.filteredRise = 0;
        const validFlight = flight.samples >= 2 && frame.tMs - LANDING_MS - flight.started >= 60;
        if (this.stage === 'maximum') {
          if (!this.quickStart && !this.manualMaximum && validFlight && flight.peak >= Math.max(.025, baseline.torso * .12)) {
            this.peakRise = flight.peak; this.stage = 'ready';
            return this.output(frame, { phase: 'ready', cue: 'ready' });
          }
          this.retryMaximum = true; this.maximumSince = frame.tMs;
        } else if (validFlight) {
          this.repIndex++;
          return this.output(frame, { phase: 'completed', cue: 'ready', completion: {
            id: `${frame.sessionId}:${RECOGNIZER_ID}:jump:${this.repIndex}`, repIndex: this.repIndex,
          } });
        }
      } else if (frame.tMs - this.flight.started > FLIGHT_TIMEOUT_MS && this.manualMaximum && this.stage === 'maximum') {
        // Keep a measured range while the player returns and confirms it.
        this.flight = null; this.landingSince = null;
      } else if (frame.tMs - this.flight.started > FLIGHT_TIMEOUT_MS) {
        this.recalibrate();
        return this.output(frame, { phase: 'calibrating', cue: 'rebaseline', quality: 'position-changed', calibrationProgress: 0 });
      }
    }
    if (preparingJump) return this.output(frame, {
      phase: this.stage === 'maximum' ? 'calibrating' : 'ready', cue: 'prepare-jump',
      calibrationProgress: this.stage === 'maximum' ? .5 : null,
    });
    if (this.stage === 'maximum') {
      if (!this.quickStart && !this.manualMaximum && !this.flight && frame.tMs - this.maximumSince > MAXIMUM_WAIT_MS) {
        this.recalibrate();
        return this.output(frame, { phase: 'calibrating', cue: 'rebaseline', quality: 'calibration-timeout', calibrationProgress: 0 });
      }
      return this.output(frame, { phase: 'calibrating',
        cue: this.manualMaximum && this.canConfirmMaximum ? 'confirm-maximum' : this.flight ? 'land-and-hold' : this.quickStart ? 'jump-to-start' : this.retryMaximum ? 'jump-higher-and-retry' : 'jump-maximum',
        quality: this.retryMaximum && !this.canConfirmMaximum ? 'insufficient-height' : 'tracked', calibrationProgress: this.canConfirmMaximum ? 1 : this.flight ? .75 : .5 });
    }
    // Grounded jitter and post-loss airborne fragments must not move the game.
    const ratio = this.flight && !grounded ? this.filteredRise / this.peakRise : 0;
    return this.output(frame, { phase: this.flight ? 'active' : 'ready', cue: this.flight ? 'jumping' : 'ready', ratio });
  }

  stand(frame, pose) {
    const anchor = this.standingAnchor;
    // Narrow projected joint widths fluctuate strongly with landmark jitter or
    // a slight turn. Quick torso entry relies on torso length/position instead.
    const quickTorso = (this.quickStart || this.robustTracking) && this.trackingMode === 'upper-body';
    const stable = pose.upright && (!anchor || Math.abs(pose.hipY - anchor.hipY) < .012
      && Math.abs(pose.shoulderY - anchor.shoulderY) < .012
      && (quickTorso || Math.abs(pose.shoulderWidth / anchor.shoulderWidth - 1) < .08
        && Math.abs(pose.hipWidth / anchor.hipWidth - 1) < .08)
      && (this.trackingMode === 'upper-body' || Math.abs(pose.leftAnkleY - anchor.leftAnkleY) < .01
        && Math.abs(pose.rightAnkleY - anchor.rightAnkleY) < .01)
      && Math.abs(pose.centerX - anchor.centerX) < .015
      && Math.abs(pose.torso / anchor.torso - 1) < .08);
    if (!stable) {
      if (this.robustTracking) return this.rejectNoise(frame, 'unstable-stance');
      this.standingSince = null; this.standingAnchor = null; this.standingSamples = [];
      return this.output(frame, { phase: 'calibrating', cue: 'stand-still', quality: 'unstable-stance', calibrationProgress: 0 });
    }
    if (this.robustTracking) this.recoverNoise(frame);
    this.standingSince ??= frame.tMs;
    this.standingAnchor ??= pose;
    this.standingSamples.push(pose);
    const elapsed = frame.tMs - this.standingSince;
    const standingMs = this.quickStart ? 250 : STANDING_MS;
    if (elapsed >= standingMs) {
      const keys = ['hipY', 'shoulderY', 'shoulderWidth', 'hipWidth', 'torso', 'centerX'];
      if (this.trackingMode === 'full-body') keys.push('leftAnkleY', 'rightAnkleY');
      this.baseline = Object.fromEntries(keys
        .map(key => [key, average(this.standingSamples.map(sample => sample[key]))]));
      this.standingSamples = []; this.stage = 'maximum'; this.armed = true;
      this.maximumSince = frame.tMs;
      return this.output(frame, { phase: 'calibrating', cue: this.quickStart ? 'jump-to-start' : 'jump-maximum', calibrationProgress: .5 });
    }
    return this.output(frame, { phase: 'calibrating', cue: 'stand-still', calibrationProgress: clamp(elapsed / standingMs) * .5 });
  }
}
