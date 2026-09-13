// Pixel-correct joint angles in normalized image coordinates.
export function kneeAngle(a, b, c, aspect = 1) {
  const u = [(a.x - b.x) * aspect, a.y - b.y];
  const v = [(c.x - b.x) * aspect, c.y - b.y];
  const length = Math.hypot(...u) * Math.hypot(...v);
  if (length < 1e-8) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / length))) * 180 / Math.PI;
}

export function poseFeatures(points, aspect = 4 / 3) {
  if (!points || !Object.keys(points).length) return null;
  const sides = [['leftShoulder', 'leftHip', 'leftKnee', 'leftAnkle'], ['rightShoulder', 'rightHip', 'rightKnee', 'rightAnkle']].map(ids => {
    const p = ids.map(i => points[i]);
    if (p.some(v => !v || !Number.isFinite(v.x) || !Number.isFinite(v.y) ||
      (v.confidence ?? 0) < .6 || v.x < .02 || v.x > .98 || v.y < .02 || v.y > .98)) return null;
    const [shoulder, hip, knee, ankle] = p;
    const torso = Math.hypot((shoulder.x - hip.x) * aspect, shoulder.y - hip.y);
    if (torso < .07 || ankle.y < hip.y + .1 || shoulder.y > hip.y - .04) return null;
    return { angle: kneeAngle(hip, knee, ankle, aspect), hip: hip.y, torso,
      confidence: Math.min(...p.map(v => v.confidence)) };
  }).filter(Boolean);
  if (!sides.length) return null;
  // Average similarly visible sides; prefer the unoccluded side otherwise.
  return sides.length === 2 && Math.abs(sides[0].confidence - sides[1].confidence) < .15
    ? { angle: (sides[0].angle + sides[1].angle) / 2, hip: (sides[0].hip + sides[1].hip) / 2,
        torso: (sides[0].torso + sides[1].torso) / 2 }
    : sides.sort((a, b) => b.confidence - a.confidence)[0];
}

export class SquatDetector {
  constructor() { this.reset(); }
  reset() {
    this.baseline = null;
    this.samples = [];
    this.lastTime = null;
    this.filtered = null;
    this.phase = 'stand';
    this.holdSince = null;
    this.downAt = null;
    this.armed = false;
    this.lastValidTime = null;
  }
  update(points, time, aspect) { return this.updateFeatures(poseFeatures(points, aspect), time); }
  updateFeatures(feature, time) {
    const gap = this.lastTime === null ? 0 : time - this.lastTime;
    this.lastTime = time;
    if (gap > 650 || (this.lastValidTime !== null && time - this.lastValidTime > 650)) {
      this.reset();
      this.lastTime = time;
    }
    if (!feature) {
      this.filtered = null;
      this.samples = [];
      this.holdSince = null;
      return { state: 'missing', progress: 0, rep: false };
    }
    this.lastValidTime = time;
    const alpha = this.filtered ? 1 - Math.exp(-Math.min(gap, 200) / 85) : 1;
    this.filtered = Object.fromEntries(['angle', 'hip', 'torso'].map(k =>
      [k, this.filtered ? this.filtered[k] + alpha * (feature[k] - this.filtered[k]) : feature[k]]));
    const f = this.filtered;
    if (!this.baseline) {
      if (f.angle < 158) { this.samples = []; return { state: 'stand', progress: 0, rep: false }; }
      if (this.samples.length && Math.abs(f.hip - this.samples[0].hip) > f.torso * .1) this.samples = [];
      this.samples.push({ ...f, time });
      const duration = time - this.samples[0].time;
      if (duration >= 1500) {
        this.baseline = { hip: this.samples.reduce((s, p) => s + p.hip, 0) / this.samples.length,
          torso: this.samples.reduce((s, p) => s + p.torso, 0) / this.samples.length };
        this.samples = [];
        this.armed = true;
        return { state: 'ready', progress: 0, rep: false };
      }
      return { state: 'calibrating', progress: Math.min(1, duration / 1500), rep: false };
    }
    const drop = (f.hip - this.baseline.hip) / this.baseline.torso;
    const standing = f.angle >= 158 && drop < .13;
    const low = f.angle <= 148 && drop >= .18;
    const progress = Math.max(0, Math.min(1, Math.min((170 - f.angle) / 30, drop / .25)));
    if (!this.armed) {
      if (!standing) this.holdSince = null;
      else this.holdSince ??= time;
      if (this.holdSince !== null && time - this.holdSince >= 250) { this.armed = true; this.holdSince = null; }
      return { state: this.armed ? 'ready' : 'stand', progress: 0, rep: false };
    }
    if (this.phase === 'stand') {
      if (low) this.holdSince ??= time;
      else this.holdSince = null;
      if (this.holdSince !== null && time - this.holdSince >= 180) {
        this.phase = 'down'; this.downAt = time; this.holdSince = null;
      }
      return { state: this.phase === 'down' ? 'down' : standing ? 'ready' : 'lowering', progress, rep: false };
    }
    if (time - this.downAt > 12_000) {
      this.phase = 'stand'; this.armed = false; this.holdSince = null;
      return { state: 'stand', progress: 0, rep: false };
    }
    if (standing) this.holdSince ??= time;
    else this.holdSince = null;
    if (this.holdSince !== null && time - this.holdSince >= 160) {
      this.phase = 'stand'; this.holdSince = null; this.downAt = null;
      return { state: 'rep', progress: 0, rep: true };
    }
    return { state: 'down', progress: standing ? .1 : Math.max(.3, progress), rep: false };
  }
}
