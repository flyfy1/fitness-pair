export const GRAVITY = 1850;
export const JUMP_VELOCITY = 660;
export const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Simulation coordinates are independent of pixel density and rendering frame rate.
export class Runner {
  constructor({ random = Math.random, width = 900 } = {}) {
    this.random = random;
    this.width = width;
    this.reset();
    this.status = 'ready';
  }
  reset() {
    this.status = 'running'; this.y = 0; this.velocity = 0;
    this.elapsed = 0; this.distance = 0; this.score = 0; this.passed = 0;
    this.speed = 310; this.obstacles = []; this.spawnIn = 1.6; this.jumps = 0;
  }
  command(action) {
    if (action === 'start' && this.status === 'ready') { this.reset(); return true; }
    if (action === 'restart' && this.status === 'over') { this.reset(); return true; }
    if (action === 'pause' && this.status === 'running') { this.status = 'paused'; return true; }
    if (action === 'resume' && this.status === 'paused') { this.status = 'running'; return true; }
    if (action === 'jump' && this.status === 'running' && this.y === 0) {
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
    this.elapsed += dt; this.speed = Math.min(560, 310 + this.elapsed * 2.4);
    this.distance += this.speed * dt / 20; this.score = Math.floor(this.distance);
    if (this.y > 0 || this.velocity > 0) {
      this.y += this.velocity * dt - GRAVITY * dt * dt / 2; this.velocity -= GRAVITY * dt;
      if (this.y <= 0) { this.y = 0; this.velocity = 0; }
    }
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const tall = this.random() > .55;
      this.obstacles.push({ x: this.width + 30, w: tall ? 29 : 42, h: tall ? 57 : 40, passed: false });
      this.spawnIn = 1.35 + this.random() * .8;
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
    return { status: this.status, score: this.score, distance: this.distance, passed: this.passed, jumps: this.jumps, speed: this.speed, airborne: this.y > 0 };
  }
}
