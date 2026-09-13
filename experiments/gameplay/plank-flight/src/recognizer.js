import { assertPoseFrame, sameSource } from '../../../../contracts/index.js';

import { FRAME_FRESH_MS } from './tracking-gate.js';

const visible = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  Number.isFinite(p.confidence) && p.confidence >= .6 && p.confidence <= 1 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
export const TAKEOFF_MS = 800;

/** Head-driven game control for push-up play, not a push-up repetition detector. */
export class HeadFlightController {
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
    if (frame.tMs - this.tMs > FRAME_FRESH_MS) this.since = null;
    this.seq = frame.seq; this.tMs = frame.tMs; this.model = frame.modelId;
    const headFound = visible(frame.head);
    const shoulderFound = ['leftShoulder', 'rightShoulder'].some(name => visible(frame.joints[name]));
    let phase = 'missing', calibrationProgress = null, headControl = null;
    let cue = headFound ? 'Head found. Bring either shoulder into view.' : 'Bring your head and either shoulder into view.';
    if (!headFound || !shoulderFound) this.since = null;
    else {
      headControl = { x: frame.head.x, y: frame.head.y, image: { ...frame.image } };
      this.since ??= frame.tMs;
      const elapsed = frame.tMs - this.since;
      if (!this.ready && elapsed < TAKEOFF_MS) {
        phase = 'calibrating'; calibrationProgress = elapsed / TAKEOFF_MS;
        cue = `Head and shoulder found. Automatic takeoff in ${((TAKEOFF_MS-elapsed)/1000).toFixed(1)} s…`;
      } else {
        this.ready = true; phase = 'active'; cue = 'The helicopter follows your head. Lower down, then push up.';
      }
    }
    return { version: 1, ...this.session, inputSeq: frame.seq, tMs: frame.tMs,
      recognizerId: 'head-flight-poc-v1', action: 'head-flight', phase,
      progress: phase === 'active' ? 1 : 0, calibrationProgress, cue, completion: null, headControl };
  }
}
