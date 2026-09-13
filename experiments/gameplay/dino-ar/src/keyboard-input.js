import { assertActionFrame } from '@fitness-pair/contracts';

/** Simulates recognizer output; never presents keyboard input as camera evidence. */
export class KeyboardInput {
  reset(sessionId) {
    this.session = { sessionId, source: { kind: 'synthetic', id: 'keyboard-preview' } };
    this.seq = 0; this.lastTime = -1; this.rep = 0; this.flight = null; this.best = 0;
  }
  jump(peak = 1) {
    if (!this.session || this.flight || !Number.isFinite(peak)) return false;
    peak = Math.max(.25, Math.min(1, peak));
    this.flight = { peak, elapsed: 0, duration: .86 * Math.sqrt(peak) };
    return true;
  }
  update(tMs, dt = 0) {
    if (!this.session || !Number.isFinite(tMs) || tMs <= this.lastTime) return null;
    this.lastTime = tMs;
    let ratio = 0, completion = null;
    if (this.flight) {
      this.flight.elapsed += Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
      const t = Math.min(1, this.flight.elapsed / this.flight.duration);
      ratio = this.flight.peak * 4 * t * (1 - t);
      if (t === 1) {
        this.best = Math.max(this.best, this.flight.peak); this.rep++;
        completion = { id: `${this.session.sessionId}:keyboard:${this.rep}`, repIndex: this.rep };
        this.flight = null;
      }
    }
    const frame = { version: 1, ...this.session, source: { ...this.session.source },
      inputSeq: this.seq++, tMs, recognizerId: 'keyboard-preview/1', action: 'jump-height',
      phase: completion ? 'completed' : this.flight ? 'active' : 'ready',
      cue: this.flight ? 'moving-up' : 'ready', progress: ratio, calibrationProgress: null,
      completion, stage: 'ready', calibrated: true, heightRatio: ratio,
      bestHeightRatio: this.best, quality: 'simulated', trackingMode: 'keyboard' };
    assertActionFrame(frame); return frame;
  }
}
