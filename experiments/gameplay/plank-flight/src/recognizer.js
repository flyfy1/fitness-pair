import { assertPoseFrame, sameSource } from '../../../../contracts/index.js';

const good = p => p && p.confidence >= .6 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a, b, c) => {
  const ab = distance(a, b), bc = distance(b, c);
  return ab && bc ? Math.acos(Math.max(-1, Math.min(1,
    ((a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y))/(ab*bc)))) * 180 / Math.PI : 0;
};

/** Side-view geometry, not a technique or health assessment. */
export function supportGeometry(frame) {
  const candidates = ['left', 'right'].flatMap(side => {
    const names = ['Shoulder', 'Elbow', 'Wrist', 'Hip', 'Knee', 'Ankle'];
    const joints = names.map(name => frame.joints[side + name]);
    if (!joints.every(good)) return [];
    const [s, e, w, h, k, a] = joints.map(p => ({ x: p.x * frame.image.width, y: p.y * frame.image.height }));
    const span = distance(s, a), torso = distance(s, h);
    if (span < frame.image.width * .22 || torso < 25) return [];
    const horizontal = Math.abs(s.y - a.y) / span < .45 && Math.abs(s.x - a.x) / span > .8;
    const straight = angle(s, h, k) >= 150 && angle(h, k, a) >= 145;
    // A visible elbow or wrist below the torso distinguishes support from a flat prone silhouette.
    const support = Math.max(e.y, w.y) - s.y > torso * .18 &&
      Math.abs(w.x - s.x) < torso * .95 && Math.max(e.y, w.y) >= h.y + torso * .12;
    return [{ supported: horizontal && straight && support,
      confidence: Math.min(...joints.map(p => p.confidence)) }];
  });
  return candidates.sort((a,b) => b.confidence-a.confidence)[0] ?? null;
}

export class PlankRecognizer {
  reset(session) {
    this.session = { sessionId: session.sessionId, source: { ...session.source } };
    this.seq = -1; this.tMs = -1; this.model = null; this.ready = false; this.since = null;
  }
  recalibrate() { this.ready = false; this.since = null; }
  update(frame) {
    assertPoseFrame(frame);
    if (!this.session) this.reset(frame);
    if (frame.sessionId !== this.session.sessionId || !sameSource(frame.source, this.session.source)) return null;
    if (frame.seq <= this.seq || frame.tMs <= this.tMs) return null;
    if (this.model && frame.modelId !== this.model) throw new Error('Model changed; start a new session.');
    if (frame.tMs - this.tMs > 250) this.since = null;
    this.seq = frame.seq; this.tMs = frame.tMs; this.model = frame.modelId;
    const geometry = supportGeometry(frame);
    let phase = 'ready', calibrationProgress = null, cue = 'Rest to descend. Hold support to lift.';
    if (!geometry) { phase = 'missing'; cue = 'Show your side, arms, hips and ankles.'; this.since = null; }
    else if (!this.ready) {
      if (geometry.supported) this.since ??= frame.tMs;
      else this.since = null;
      const elapsed = this.since === null ? 0 : frame.tMs - this.since;
      phase = 'calibrating'; calibrationProgress = Math.min(1, elapsed / 1200);
      cue = geometry.supported ? 'Support found. Hold steady…' : 'Get into a side-on plank or push-up support.';
      if (elapsed >= 1200) { this.ready = true; phase = 'active'; calibrationProgress = null; cue = 'You are flying. One breath at a time.'; }
    } else if (geometry.supported) { phase = 'active'; cue = 'Support detected · lifting'; }
    return { version: 1, ...this.session, inputSeq: frame.seq, tMs: frame.tMs,
      recognizerId: 'plank-sideview-poc-v1', action: 'plank-hold', phase,
      progress: phase === 'active' ? 1 : 0, calibrationProgress, cue, completion: null };
  }
}
