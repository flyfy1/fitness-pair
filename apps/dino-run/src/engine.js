import { assertActionFrame, sameSource } from '@fitness-pair/contracts';

export const GRAVITY = 1850;
export const JUMP_VELOCITY = 660;
export const MOTION_MAX_HEIGHT = 165;
export const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Simulation coordinates are independent of pixel density and rendering frame rate.
export class Runner {
  constructor({ random = Math.random, width = 900 } = {}) {
    this.random = random;
    this.width = width;
    this.controlMode = 'keyboard';
    this.reset();
    this.status = 'ready';
  }
  reset() {
    this.roundId = (this.roundId ?? 0) + 1;
    this.status = 'running'; this.y = 0; this.velocity = 0;
    this.elapsed = 0; this.distance = 0; this.score = 0; this.passed = 0;
    this.speed = this.controlMode === 'motion' ? 180 : 310;
    this.obstacles = []; this.spawnIn = this.controlMode === 'motion' ? 2.5 : 1.6; this.jumps = 0;
    this.lastMotionSeq = -1; this.lastMotionTime = -1; this.completions = new Set();
  }
  setControlMode(mode) {
    if (!['keyboard', 'motion'].includes(mode)) throw new TypeError('Unknown control mode');
    this.controlMode = mode; this.motionSession = null; this.reset(); this.status = 'ready';
  }
  bindMotionSession(session) {
    this.motionSession = { sessionId: session.sessionId, source: { ...session.source } };
    this.lastMotionSeq = -1; this.lastMotionTime = -1; this.completions.clear(); this.y = 0;
  }
  applyMotion(frame) {
    assertActionFrame(frame);
    if (this.controlMode !== 'motion' || !this.motionSession || frame.action !== 'jump-height' ||
      frame.sessionId !== this.motionSession.sessionId || !sameSource(frame.source, this.motionSession.source) ||
      frame.inputSeq <= this.lastMotionSeq || frame.tMs <= this.lastMotionTime ||
      !frame.calibrated || frame.stage !== 'ready' || frame.phase === 'missing' ||
      !Number.isFinite(frame.heightRatio) || frame.heightRatio < 0 || frame.heightRatio > 1) return false;
    this.lastMotionSeq = frame.inputSeq; this.lastMotionTime = frame.tMs;
    if (!['ready', 'running'].includes(this.status)) return false;
    this.y = frame.heightRatio * MOTION_MAX_HEIGHT; this.velocity = 0;
    // Continuous pose height positions the sprite; only completed IDs count jumps.
    if (frame.completion && !this.completions.has(frame.completion.id)) {
      this.completions.add(frame.completion.id);
      if (this.status === 'running') this.jumps++;
    }
    return true;
  }
  command(action) {
    if (action === 'start' && this.status === 'ready') { this.reset(); return true; }
    if (action === 'restart' && this.status === 'over') { this.reset(); return true; }
    if (action === 'pause' && this.status === 'running') { this.status = 'paused'; return true; }
    if (action === 'resume' && this.status === 'paused') { this.status = 'running'; return true; }
    if (action === 'jump' && this.controlMode === 'keyboard' && this.status === 'running' && this.y === 0) {
      this.velocity = JUMP_VELOCITY; this.y = .01; this.jumps++; return true;
    }
    return false;
  }
  step(dt) {
    if (this.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
    // Substeps prevent tunneling when a frame is slow. Long interruptions freeze time.
    let left = Math.min(dt, .1);
    while (left > 0 && this.status === 'running') {
      const slice = Math.min(left, 1 / 120); this.advance(slice); left -= slice;
    }
  }
  advance(dt) {
    this.elapsed += dt;
    this.speed = this.controlMode === 'motion' ? Math.min(250, 180 + this.elapsed * .4) : Math.min(560, 310 + this.elapsed * 2.4);
    this.distance += this.speed * dt / 20; this.score = Math.floor(this.distance);
    if (this.controlMode === 'keyboard' && (this.y > 0 || this.velocity > 0)) {
      this.y += this.velocity * dt - GRAVITY * dt * dt / 2; this.velocity -= GRAVITY * dt;
      if (this.y <= 0) { this.y = 0; this.velocity = 0; }
    }
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const tall = this.random() > .55;
      this.obstacles.push({ x: this.width + 30,
        w: this.controlMode === 'motion' ? 18 : tall ? 29 : 42,
        h: this.controlMode === 'motion' ? tall ? 58 : 25 : tall ? 57 : 40, passed: false });
      this.spawnIn = this.controlMode === 'motion' ? 2.8 + this.random() : 1.35 + this.random() * .8;
    }
    const player = { x: 84, y: -this.y - 47, w: 32, h: 44 };
    for (const obstacle of this.obstacles) {
      obstacle.x -= this.speed * dt;
      if (intersects(player, { x: obstacle.x + 4, y: -obstacle.h + 4, w: obstacle.w - 8, h: obstacle.h - 4 })) this.status = 'over';
      if (!obstacle.passed && obstacle.x + obstacle.w < 80) { obstacle.passed = true; this.passed++; }
    }
    this.obstacles = this.obstacles.filter(obstacle => obstacle.x + obstacle.w > -20);
  }
  snapshot() {
    return { roundId: this.roundId, status: this.status, score: this.score, distance: this.distance, passed: this.passed, jumps: this.jumps, speed: this.speed, airborne: this.y > 0, height: this.y, controlMode: this.controlMode };
  }
}
