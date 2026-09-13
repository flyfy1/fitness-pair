import { assertPoseFrame, assertActionFrame, sameSource } from '@fitness-pair/contracts';

export const RECOGNIZER_ID = 'jump-height-2d/1';
const STANDING_MS = 1500;
const LANDING_MS = 200;
const LOSS_MS = 750;
const FLIGHT_TIMEOUT_MS = 2500;
const MAXIMUM_WAIT_MS = 15000;
const clamp = value => Math.max(0, Math.min(1, value));
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const required = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip',
  'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];

function geometry(frame) {
  const joints = frame.joints;
  if (required.some(name => !joints[name] || joints[name].confidence === null
    || joints[name].confidence < .6 || joints[name].x < .015 || joints[name].x > .985
    || joints[name].y < .015 || joints[name].y > .985)) return null;
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
    return shoulder.y + .08 < hip.y && hip.y + .06 < knee.y && knee.y + .06 < ankle.y
      && Math.abs(shoulder.x - hip.x) * aspect < (hip.y - shoulder.y) * .7
      && kneeAngle(hip, knee, ankle) > 155;
  });
  return {
    hipY: average([joints.leftHip.y, joints.rightHip.y]),
    leftAnkleY: joints.leftAnkle.y, rightAnkleY: joints.rightAnkle.y,
    torso: average(['left', 'right'].map(side => distance(joints[`${side}Shoulder`], joints[`${side}Hip`]))),
    centerX: average([joints.leftHip.x, joints.rightHip.x]), upright,
  };
}

/** Relative image displacement only: no camera, recording, or model-specific joints. */
export class JumpHeightRecognizer {
  reset({ sessionId, source }) {
    this.sessionId = sessionId;
    this.source = { ...source };
    this.lastSeq = -1; this.lastTMs = -1; this.modelId = null;
    this.repIndex = 0; this.imageKey = null;
    this.recalibrate();
  }

  recalibrate() {
    this.stage = 'standing'; this.baseline = null; this.peakRise = null;
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
      stage: this.stage, calibrated, heightRatio, peakRise: this.peakRise, quality,
    };
    assertActionFrame(result);
    return result;
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
    if (this.lastValidTMs !== null && frame.tMs - this.lastValidTMs > LOSS_MS) this.recalibrate();
    const pose = geometry(frame);
    if (!pose) {
      // A lost interval cannot provide evidence of a landing or stable standing.
      this.flight = null; this.landingSince = null; this.armed = false; this.rearmSince = null;
      this.standingSince = null; this.standingAnchor = null; this.standingSamples = [];
      this.filterTMs = null; this.filteredRise = 0;
      return this.output(frame, { phase: 'missing', cue: 'move-back-into-frame', quality: 'tracking-lost' });
    }
    this.lastValidTMs = frame.tMs;
    if (this.stage === 'standing') return this.stand(frame, pose);

    const baseline = this.baseline;
    const scaleChanged = Math.abs(pose.torso / baseline.torso - 1) > .2;
    const movedSideways = Math.abs(pose.centerX - baseline.centerX) > .12;
    const movedDown = Math.min(pose.leftAnkleY - baseline.leftAnkleY, pose.rightAnkleY - baseline.rightAnkleY) > .045;
    if (scaleChanged || movedSideways || movedDown) {
      this.driftSince ??= frame.tMs;
      this.flight = null; this.landingSince = null; this.armed = false;
      this.filterTMs = null; this.filteredRise = 0;
      if (frame.tMs - this.driftSince >= 400) this.recalibrate();
      return this.output(frame, { phase: 'missing', cue: 'rebaseline', quality: 'position-changed' });
    }
    this.driftSince = null;
    const hipRise = baseline.hipY - pose.hipY;
    const leftRise = baseline.leftAnkleY - pose.leftAnkleY;
    const rightRise = baseline.rightAnkleY - pose.rightAnkleY;
    // Both feet must rise; hip rise caps tucked feet and raised knees.
    const rawRise = Math.max(0, Math.min(hipRise, leftRise, rightRise));
    const alpha = this.filterTMs === null ? 1 : 1 - Math.exp(-(frame.tMs - this.filterTMs) / 35);
    this.filteredRise += alpha * (rawRise - this.filteredRise);
    this.filterTMs = frame.tMs;
    const liftThreshold = Math.max(.008, baseline.torso * .035);
    const landThreshold = Math.max(.005, baseline.torso * .025);
    const airborne = rawRise > liftThreshold;
    const grounded = leftRise <= landThreshold && rightRise <= landThreshold && hipRise <= liftThreshold;

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
      if (grounded) this.landingSince ??= frame.tMs;
      else this.landingSince = null;
      if (this.landingSince !== null && frame.tMs - this.landingSince >= LANDING_MS) {
        const flight = this.flight;
        this.flight = null; this.landingSince = null; this.filteredRise = 0;
        const validFlight = flight.samples >= 2 && frame.tMs - LANDING_MS - flight.started >= 60;
        if (this.stage === 'maximum') {
          if (validFlight && flight.peak >= Math.max(.025, baseline.torso * .12)) {
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
      } else if (frame.tMs - this.flight.started > FLIGHT_TIMEOUT_MS) {
        this.recalibrate();
        return this.output(frame, { phase: 'calibrating', cue: 'rebaseline', quality: 'position-changed', calibrationProgress: 0 });
      }
    }
    if (this.stage === 'maximum') {
      if (!this.flight && frame.tMs - this.maximumSince > MAXIMUM_WAIT_MS) {
        this.recalibrate();
        return this.output(frame, { phase: 'calibrating', cue: 'rebaseline', quality: 'calibration-timeout', calibrationProgress: 0 });
      }
      return this.output(frame, { phase: 'calibrating',
        cue: this.flight ? 'land-and-hold' : this.retryMaximum ? 'jump-higher-and-retry' : 'jump-maximum',
        quality: this.retryMaximum ? 'insufficient-height' : 'tracked', calibrationProgress: this.flight ? .75 : .5 });
    }
    // Grounded jitter and post-loss airborne fragments must not move the game.
    const ratio = this.flight && !grounded ? this.filteredRise / this.peakRise : 0;
    return this.output(frame, { phase: this.flight ? 'active' : 'ready', cue: this.flight ? 'jumping' : 'ready', ratio });
  }

  stand(frame, pose) {
    const anchor = this.standingAnchor;
    const stable = pose.upright && (!anchor || Math.abs(pose.hipY - anchor.hipY) < .012
      && Math.abs(pose.leftAnkleY - anchor.leftAnkleY) < .01
      && Math.abs(pose.rightAnkleY - anchor.rightAnkleY) < .01
      && Math.abs(pose.centerX - anchor.centerX) < .015
      && Math.abs(pose.torso / anchor.torso - 1) < .08);
    if (!stable) {
      this.standingSince = null; this.standingAnchor = null; this.standingSamples = [];
      return this.output(frame, { phase: 'calibrating', cue: 'stand-still', quality: 'unstable-stance', calibrationProgress: 0 });
    }
    this.standingSince ??= frame.tMs;
    this.standingAnchor ??= pose;
    this.standingSamples.push(pose);
    const elapsed = frame.tMs - this.standingSince;
    if (elapsed >= STANDING_MS) {
      this.baseline = Object.fromEntries(['hipY', 'leftAnkleY', 'rightAnkleY', 'torso', 'centerX']
        .map(key => [key, average(this.standingSamples.map(sample => sample[key]))]));
      this.standingSamples = []; this.stage = 'maximum'; this.armed = true;
      this.maximumSince = frame.tMs;
      return this.output(frame, { phase: 'calibrating', cue: 'jump-maximum', calibrationProgress: .5 });
    }
    return this.output(frame, { phase: 'calibrating', cue: 'stand-still', calibrationProgress: clamp(elapsed / STANDING_MS) * .5 });
  }
}
