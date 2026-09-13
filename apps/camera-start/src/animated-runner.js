import {createActionController} from '../../../packages/gameplay/input.js';
import { Runner } from '../../dino-run/src/engine.js';

const DELAY_S = .03, GRAVITY = 1000, LIFT = 500, MAX_LIFT_S = .25;

/** A movement triggers one arc. Camera height never directly positions the sprite. */
export class AnimatedRunner extends Runner {
  constructor({ onEvent = () => {}, ...options } = {}) {
    super(options);
    this.onEvent = onEvent;
    this.input = createActionController({action:'jump-height',accept:f=>this.controlMode==='motion' && ['ready','running'].includes(this.status) && f.calibrated && f.stage==='ready' && f.phase!=='missing' && Number.isFinite(f.heightRatio) && f.heightRatio>=0 && f.heightRatio<=1,apply:(_, {completed})=>{if(completed && this.status==='running')this.jumps++;}});
    this.resetAnimation();
  }
  resetAnimation() {
    this.arc = { height: 0, velocity: 0, pending: null, liftSeconds: 0, peak: 0 };
    this.motion = null; this.armed = false; this.lastObservedMs = null;
    this.lastAirMs = null; this.triggerCount = 0;
  }
  reset() { super.reset(); this.resetAnimation(); }
  bindMotionSession(session) { this.input.reset(session); this.resetAnimation(); }
  command(command) {
    const changed = super.command(command);
    if (changed && command === 'pause') {
      // Pause time and invisible movement cannot increase the measured flight.
      if (this.motion?.triggered) this.lastAirMs = null;
      this.motion = null; this.armed = false;
    }
    return changed;
  }
  applyMotion(frame) {
    const height = this.y;
    const accepted = this.input.consume(frame);
    this.y = height;
    if (!accepted) return false;
    if (this.lastObservedMs !== null && frame.tMs - this.lastObservedMs >= 250) {
      this.motion = null; this.armed = false;
    }
    this.lastObservedMs = frame.tMs;
    const grounded = frame.heightRatio === 0;
    if (grounded && ['ready', 'completed'].includes(frame.phase)) this.armed = true;
    if (!this.motion && this.armed && frame.phase === 'active' && frame.heightRatio >= .12) {
      this.motion = { startMs: frame.tMs, samples: 0, triggered: false, returnMs: null };
    }
    const motion = this.motion;
    if (!motion) return true;
    if (grounded) {
      motion.returnMs ??= frame.tMs;
      // Measure the first observed return, excluding the recognizer's landing hold.
      if (frame.tMs - motion.returnMs >= 40 || frame.completion) {
        if (motion.triggered) {
          this.lastAirMs = Math.round(motion.returnMs - motion.startMs);
          this.onEvent('dino-body-returned', { observedAirMs: this.lastAirMs });
        }
        this.motion = null;
      }
    } else {
      motion.returnMs = null;
      motion.samples++;
      if (!motion.triggered && !motion.ignored && motion.samples >= 2 && frame.tMs - motion.startMs >= 60) {
        this.armed = false;
        motion.triggered = true;
        // Do not stack or queue a delayed second jump while Dino is airborne.
        if (this.arc.pending === null && this.arc.height === 0) {
          this.arc.pending = DELAY_S; this.arc.peak = 0; this.arc.liftSeconds = 0;
          this.lastAirMs = null;
          this.triggerCount++;
          this.onEvent('dino-jump-triggered', { delayMs: DELAY_S * 1000, inputSeq: frame.inputSeq });
        } else {
          // A new body cycle cannot extend the previous dinosaur's flight.
          motion.triggered = false; motion.ignored = true;
          this.onEvent('dino-jump-ignored', { reason: 'animation-in-progress' });
        }
      }
    }
    return true;
  }
  step(dt) {
    if (this.controlMode !== 'motion') return super.step(dt);
    if (this.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, .1);
    while (remaining > 1e-8 && this.status === 'running') {
      const slice = Math.min(remaining, 1 / 120);
      this.animate(slice);
      this.y = this.arc.height;
      // Advance collision rules on the same substeps as the visible trajectory.
      super.step(slice);
      remaining -= slice;
    }
  }
  settleJump(dt) {
    // On tracking recovery, let an already-triggered arc land while the runway
    // waits. Manual pause still freezes the entire scene.
    if (this.status !== 'paused' || !Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, .1);
    while (remaining > 1e-8) {
      const slice = Math.min(remaining, 1 / 120);
      this.animate(slice); this.y = this.arc.height; remaining -= slice;
    }
  }
  animate(dt) {
    const arc = this.arc;
    if (arc.pending !== null) {
      arc.pending -= dt;
      if (arc.pending > 0) return;
      dt = Math.max(0, -arc.pending);
      arc.pending = null; arc.velocity = 360;
    }
    if (arc.height === 0 && arc.velocity === 0) return;
    // Longer observed rise-to-return time sustains lift. Even at full lift,
    // acceleration stays downward: position and velocity never snap on return.
    const lifting = this.motion?.triggered && !this.motion.ignored
      && this.motion.returnMs === null && arc.velocity > 0;
    const boost = lifting ? Math.min(dt, MAX_LIFT_S - arc.liftSeconds) : 0;
    if (boost > 0) {
      arc.height += arc.velocity * boost - (GRAVITY - LIFT) * boost * boost / 2;
      arc.velocity -= (GRAVITY - LIFT) * boost;
      arc.liftSeconds += boost;
    }
    const coast = dt - boost;
    arc.height += arc.velocity * coast - GRAVITY * coast * coast / 2;
    arc.velocity -= GRAVITY * coast;
    arc.peak = Math.max(arc.peak, arc.height);
    if (arc.height <= 0) {
      arc.height = 0; arc.velocity = 0;
      this.onEvent('dino-jump-landed', { peakHeight: Math.round(arc.peak), observedAirMs: this.lastAirMs });
    }
  }
  snapshot() {
    return { ...super.snapshot(), jumpAnimation: {
      phase: this.arc.pending !== null ? 'buffering' : this.arc.height === 0 ? 'grounded'
        : this.arc.velocity > 0 ? 'rising' : 'falling',
      height: this.arc.height, velocity: this.arc.velocity, peakHeight: this.arc.peak,
      observedAirMs: this.lastAirMs, triggerCount: this.triggerCount,
    } };
  }
}
