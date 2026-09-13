import { assertPoseFrame, assertActionFrame, sameSource } from '@fitness-pair/contracts';
import { SquatDetector } from './detector.js';

export const RECOGNIZER_ID = 'squat-2d-hysteresis/1';
const phases = { missing: 'missing', stand: 'calibrating', calibrating: 'calibrating',
  ready: 'ready', lowering: 'active', down: 'active', rep: 'completed' };

export class SquatRecognizer {
  constructor() { this.detector = new SquatDetector(); }
  reset({ sessionId, source }) {
    this.sessionId = sessionId; this.source = { ...source };
    this.lastSeq = -1; this.lastTMs = -1; this.modelId = null; this.repIndex = 0;
    this.detector.reset();
  }
  // Calibration never resets completion IDs within the same session.
  recalibrate() { this.detector.reset(); }
  update(frame) {
    assertPoseFrame(frame);
    if (frame.sessionId !== this.sessionId || !sameSource(frame.source, this.source)) throw new Error('Reset recognizer before changing session or source');
    if (frame.seq <= this.lastSeq || frame.tMs <= this.lastTMs) return null;
    if (this.modelId && this.modelId !== frame.modelId) throw new Error('Model change requires a new session');
    this.modelId = frame.modelId; this.lastSeq = frame.seq; this.lastTMs = frame.tMs;
    const result = this.detector.update(frame.joints, frame.tMs, frame.image.width / frame.image.height);
    if (result.rep) this.repIndex++;
    const phase = phases[result.state];
    const output = { version: 1, sessionId: frame.sessionId, inputSeq: frame.seq, tMs: frame.tMs,
      source: { ...frame.source }, recognizerId: RECOGNIZER_ID, action: 'squat', phase, cue: result.state,
      progress: ['missing', 'calibrating'].includes(phase) ? 0 : result.progress,
      calibrationProgress: phase === 'calibrating' ? result.progress : null,
      completion: result.rep ? { id: `${frame.sessionId}:${RECOGNIZER_ID}:squat:${this.repIndex}`, repIndex: this.repIndex } : null };
    assertActionFrame(output); return output;
  }
}
