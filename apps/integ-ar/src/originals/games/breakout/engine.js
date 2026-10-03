const STEP_MS = 1000 / 120;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Game time advances only while the camera host has resumed play. This engine
// has no camera, landmarks, rendering or storage and can run in Node regressions.
export class BrickPulseEngine {
  constructor() { this.reset(); }
  reset() {
    this.score = 0; this.level = 1; this.lives = 3; this.paddle = 140;
    this.over = false; this.remainderMs = 0; this.serves = 0;
    this.fill(); this.prepareServe(1800);
  }
  fill() {
    this.bricks = [];
    for (let row = 0; row < Math.min(8, 4 + this.level); row++)
      for (let col = 0; col < 8; col++)
        this.bricks.push({x: 16 + col * 42, y: 70 + row * 25, hp: row > 2 ? 2 : 1});
  }
  movePaddle(position) {
    if (this.over || !Number.isFinite(position)) return;
    this.paddle = clamp(position, 8, 272);
    if (this.serveRemainingMs > 0) this.ball.x = this.paddle + 40;
  }
  prepareServe(duration) {
    this.serveRemainingMs = duration;
    this.ball = {x: this.paddle + 40, y: 488, dx: 0, dy: 0};
  }
  launch() {
    this.serves++;
    this.ball.dx = (this.serves % 2 ? 1 : -1) * Math.min(360, 186 + (this.level - 1) * 9);
    this.ball.dy = -Math.min(390, 210 + (this.level - 1) * 7.2);
  }
  advance(elapsedMs) {
    if (this.over || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return [];
    // Do not simulate a tab stall as an invisible burst of ball movement.
    this.remainderMs += Math.min(100, elapsedMs);
    const events = [];
    while (this.remainderMs + 1e-7 >= STEP_MS && !this.over) {
      this.remainderMs -= STEP_MS;
      this.step(STEP_MS / 1000, events);
    }
    return events;
  }
  step(dt, events) {
    if (this.serveRemainingMs > 0) {
      this.serveRemainingMs = Math.max(0, this.serveRemainingMs - dt * 1000);
      if (this.serveRemainingMs < 1e-7) { this.serveRemainingMs = 0; this.launch(); events.push({kind: 'serve'}); }
      return;
    }
    const ball = this.ball, previous = {x: ball.x, y: ball.y};
    ball.x += ball.dx * dt; ball.y += ball.dy * dt;
    if (ball.x < 6 || ball.x > 354) {
      ball.x = clamp(ball.x, 6, 354); ball.dx *= -1; events.push({kind: 'wall'});
    }
    if (ball.y < 45) { ball.y = 45; ball.dy = Math.abs(ball.dy); }
    if (ball.dy > 0 && previous.y <= 494 && ball.y >= 494 && ball.x >= this.paddle - 6 && ball.x <= this.paddle + 86) {
      const speed = Math.hypot(ball.dx, ball.dy), offset = clamp((ball.x - this.paddle - 40) / 40, -1, 1);
      ball.y = 494;
      ball.dx = Math.abs(offset) < .12 ? Math.sign(ball.dx || 1) * speed * .12 : offset * speed * .85;
      ball.dy = -Math.sqrt(speed * speed - ball.dx * ball.dx);
      events.push({kind: 'paddle', x: ball.x, y: ball.y});
    }
    for (const brick of this.bricks) {
      if (ball.x < brick.x - 6 || ball.x > brick.x + 42 || ball.y < brick.y - 6 || ball.y > brick.y + 24) continue;
      if (previous.y <= brick.y - 6) { ball.y = brick.y - 6; ball.dy = -Math.abs(ball.dy); }
      else if (previous.y >= brick.y + 24) { ball.y = brick.y + 24; ball.dy = Math.abs(ball.dy); }
      else { ball.dx *= -1; ball.x = previous.x <= brick.x ? brick.x - 6 : brick.x + 42; }
      brick.hp--;
      if (brick.hp === 0) { this.bricks.splice(this.bricks.indexOf(brick), 1); this.score += 10 * this.level; }
      events.push({kind: 'brick', x: ball.x, y: ball.y, cleared: brick.hp === 0});
      break;
    }
    if (ball.y > 540) {
      this.lives--; this.over = this.lives === 0;
      if (!this.over) this.prepareServe(2000);
      events.push({kind: this.over ? 'lost' : 'life-lost'});
    } else if (!this.bricks.length) {
      this.level++; this.score += 100; this.fill(); this.prepareServe(1800);
      events.push({kind: 'level'});
    }
  }
  snapshot() {
    return {phase: this.over ? 'lost' : 'playing', score: this.score, level: this.level,
      lives: this.lives, maxLives: 3, paddle: this.paddle, ball: {...this.ball},
      bricks: this.bricks.length, serveRemainingMs: this.serveRemainingMs};
  }
}
