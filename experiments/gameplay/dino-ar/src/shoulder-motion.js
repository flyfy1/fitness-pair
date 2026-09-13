import { assertPoseFrame, assertActionFrame, sameSource } from '@fitness-pair/contracts';

const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const clamp = n => Math.max(0, Math.min(1, n));
const visible = p => p && p.confidence !== null && p.confidence >= .5
  && p.x > .01 && p.x < .99 && p.y > .01 && p.y < .99;

/** Cropped-camera game control, not verified physical jumping. No hips required. */
export class ShoulderMotionRecognizer {
  reset(session) {
    this.session = { sessionId: session.sessionId, source: { ...session.source } };
    this.seq = -1; this.time = -1; this.rep = 0; this.modelId = null; this.imageKey = null;
    this.recalibrate();
  }
  recalibrate() {
    this.stage = 'standing'; this.baseline = null; this.samples = [];
    this.flight = null; this.landingSince = null; this.lastValid = null;
    this.filtered = 0; this.filterTime = null; this.recovering = false;
  }
  output(frame, phase, cue, { quality = 'tracked', ratio = 0, progress = null, completion = null } = {}) {
    const calibrated = this.stage === 'ready';
    const heightRatio = calibrated && phase !== 'missing' ? clamp(ratio) : 0;
    const output = { version: 1, sessionId: frame.sessionId, source: { ...frame.source },
      inputSeq: frame.seq, tMs: frame.tMs, recognizerId: 'ar-shoulder-rise/1', action: 'jump-height',
      phase, cue, progress: heightRatio, calibrationProgress: progress, completion,
      stage: this.stage, calibrated, heightRatio, quality, trackingMode: 'shoulders',
      visibleShoulders: [frame.joints.leftShoulder, frame.joints.rightShoulder].filter(visible).length,
      peakRise: this.baseline?.range ?? null };
    assertActionFrame(output); return output;
  }
  update(frame) {
    assertPoseFrame(frame);
    if (!this.session || frame.sessionId !== this.session.sessionId || !sameSource(frame.source, this.session.source)) {
      throw new Error('Reset shoulder controls before changing session or source');
    }
    if (frame.seq <= this.seq || frame.tMs <= this.time) return null;
    if (this.modelId && this.modelId !== frame.modelId) throw new Error('Model change requires a new session');
    this.seq = frame.seq; this.time = frame.tMs; this.modelId = frame.modelId;
    const key = `${frame.image.width}:${frame.image.height}`;
    if (this.imageKey && key !== this.imageKey) this.recalibrate();
    this.imageKey = key;
    if (this.lastValid !== null && frame.tMs - this.lastValid > 750) this.recalibrate();
    const left = frame.joints.leftShoulder, right = frame.joints.rightShoulder;
    if (!visible(left) || !visible(right)) {
      this.samples = []; this.flight = null; this.landingSince = null;
      this.recovering = !!this.baseline; this.filtered = 0; this.filterTime = null;
      return this.output(frame, 'missing', 'show-both-shoulders', { quality: 'shoulders-not-visible' });
    }
    const pose = { leftY: left.y, rightY: right.y, x: (left.x + right.x) / 2,
      width: Math.abs(right.x - left.x) * frame.image.width / frame.image.height, t: frame.tMs };
    if (pose.width < .025) {
      this.recalibrate();
      return this.output(frame, 'missing', 'face-the-camera', { quality: 'shoulders-overlap' });
    }
    this.lastValid = frame.tMs;
    if (!this.baseline) {
      const first = this.samples[0];
      if (first && (Math.abs(pose.leftY - first.leftY) > .015 || Math.abs(pose.rightY - first.rightY) > .015
        || Math.abs(pose.x - first.x) > .03 || Math.abs(pose.width / first.width - 1) > .4)) this.samples = [];
      this.samples.push(pose);
      const elapsed = frame.tMs - this.samples[0].t;
      if (elapsed >= 200 && this.samples.length >= 3) {
        this.baseline = Object.fromEntries(['leftY', 'rightY', 'x', 'width'].map(k => [k, mean(this.samples.map(p => p[k]))]));
        this.baseline.range = Math.max(.04, this.baseline.width * .7);
        this.stage = 'maximum'; this.samples = [];
        return this.output(frame, 'calibrating', 'jump-to-start', { progress: .5 });
      }
      return this.output(frame, 'calibrating', 'hold-shoulders-steady', { progress: clamp(elapsed / 200) * .5 });
    }
    const b = this.baseline;
    if (Math.abs(pose.x - b.x) > .18 || Math.abs(pose.width / b.width - 1) > .4) {
      this.recalibrate();
      return this.output(frame, 'calibrating', 'hold-shoulders-steady', { quality: 'position-changed', progress: 0 });
    }
    // Both shoulders must move: one lifted arm/shoulder cannot trigger the game.
    const rise = Math.max(0, Math.min(b.leftY - pose.leftY, b.rightY - pose.rightY));
    const lift = Math.max(.008, b.width * .04), grounded = rise < lift * .45;
    const alpha = this.filterTime === null ? 1 : 1 - Math.exp(-(frame.tMs - this.filterTime) / 35);
    this.filtered += alpha * (rise - this.filtered); this.filterTime = frame.tMs;
    if (this.recovering) {
      if (grounded) this.landingSince ??= frame.tMs; else this.landingSince = null;
      if (this.landingSince === null || frame.tMs - this.landingSince < 150) {
        return this.output(frame, 'missing', 'return-to-starting-height', { quality: 'recovering-tracking' });
      }
      this.recovering = false; this.landingSince = null;
    }
    if (rise > lift) {
      this.flight ??= { started: frame.tMs, samples: 0, confirmed: false };
      this.flight.samples++;
      if (this.flight.samples >= 2 && frame.tMs - this.flight.started >= 60) {
        this.flight.confirmed = true; this.stage = 'ready';
      }
    }
    let completion = null;
    if (this.flight) {
      if (grounded) this.landingSince ??= frame.tMs; else this.landingSince = null;
      if (this.landingSince !== null && frame.tMs - this.landingSince >= 150) {
        if (this.flight.confirmed) {
          this.rep++; completion = { id: `${frame.sessionId}:ar-shoulder-rise:${this.rep}`, repIndex: this.rep };
        }
        this.flight = null; this.landingSince = null; this.filtered = 0;
      } else if (frame.tMs - this.flight.started > 2500) {
        this.recalibrate();
        return this.output(frame, 'calibrating', 'hold-shoulders-steady', { quality: 'position-changed', progress: 0 });
      }
    }
    if (this.stage !== 'ready') return this.output(frame, 'calibrating', this.flight ? 'detecting-rise' : 'jump-to-start', { progress: .5 });
    return this.output(frame, completion ? 'completed' : this.flight?.confirmed ? 'active' : 'ready',
      this.flight?.confirmed ? 'moving-up' : 'ready', {
        ratio: this.flight?.confirmed && !grounded ? this.filtered / b.range : 0, completion });
  }
}
