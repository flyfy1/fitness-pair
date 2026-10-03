import {sameSource} from '../../../contracts/index.js';

const FRESH_MS = 250, HOLD_MS = 500, COUNTDOWN_MS = 1500;
export const TRACKING_GRACE_MS = 1500;

export function trackingGrace(lastValidAt, now) {
  const age = now - lastValidAt;
  const expired = !Number.isFinite(now) || Number.isNaN(age) || age < 0 || age >= TRACKING_GRACE_MS;
  return {holding: expired || age >= FRESH_MS, expired,
    remainingMs: expired ? 0 : Math.max(0, TRACKING_GRACE_MS - age)};
}

/** Observed, neutral tracking can recover a paused round; render time cannot. */
export class TrackingRecovery {
  reset(session) {
    this.session = session; this.seq = -1; this.time = -1;
    this.cancel();
  }
  cancel() { this.active = false; this.clear('inactive'); }
  begin() { this.active = true; this.clear('tracking'); }
  clear(status) { this.status = status; this.since = null; this.lastInputAt = -Infinity; }
  observe(frame, hands, now) {
    if (!this.active) return this.read(now);
    if (!Number.isFinite(now) || !frame || !this.session
      || frame.sessionId !== this.session.sessionId || !frame.source || !this.session.source || !sameSource(frame.source, this.session.source)
      || !Number.isInteger(frame.inputSeq) || frame.inputSeq <= this.seq
      || !Number.isFinite(frame.tMs) || frame.tMs <= this.time
      || now < frame.tMs || now - frame.tMs >= FRESH_MS) return this.read(now);
    if (frame.tMs - this.time >= FRESH_MS) this.clear('tracking');
    this.seq = frame.inputSeq; this.time = frame.tMs; this.lastInputAt = frame.tMs;
    if (!['active', 'ready', 'completed'].includes(frame.phase)) {
      this.status = 'tracking'; this.since = null;
    } else if (!hands?.tracked || !hands.neutral || hands.inputSeq !== frame.inputSeq
      || !frame.controls?.leftLowered || frame.controls.leftRaised || frame.controls.rightRaised
      || frame.completion) {
      this.status = 'hands'; this.since = null;
    } else {
      this.since ??= frame.tMs;
      const held = frame.tMs - this.since;
      this.status = held < HOLD_MS ? 'steady' : held < HOLD_MS + COUNTDOWN_MS ? 'countdown' : 'ready';
    }
    return this.read(now);
  }
  read(now) {
    if (this.active && (!Number.isFinite(now) || now - this.lastInputAt >= FRESH_MS)) this.clear('tracking');
    return {status: this.status, remainingMs: this.status === 'countdown'
      ? Math.max(0, this.since + HOLD_MS + COUNTDOWN_MS - this.lastInputAt) : null};
  }
}
