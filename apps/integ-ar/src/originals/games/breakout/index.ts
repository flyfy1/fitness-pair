// Adapted from flyfy1/integ-games c2a3374; see apps/integ-ar/README.md.
import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { clamp, makeKit, text } from '../arcade-kit';

type Brick = { x: number; y: number; hp: number };

export const breakout: GameModule = {
  meta: { slug: 'breakout', title: 'Brick Pulse', category: 'arcade', description: 'A luminous brick breaker with escalating pulse rows.', instructions: 'Drag the paddle or use arrow keys; clear every brick.', accent: '#70f0c2', mechanic: 'Bounce ball and clear bricks' },
  mount(host: HTMLElement, services: GameServices): GameController {
    const k = makeKit(host, services, 'breakout'); let raf = 0, paused = false, over = false, score = 0, level = 1, paddle = 140;
    let ball = { x: 180, y: 426, dx: 3.1, dy: -3.5 }, bricks: Brick[] = [];
    const fill = () => { bricks = []; for (let row = 0; row < Math.min(8, 4 + level); row++) for (let col = 0; col < 8; col++) bricks.push({ x: 16 + col * 42, y: 70 + row * 25, hp: row > 2 ? 2 : 1 }); };
    const reset = () => { paused = false; over = false; score = 0; level = 1; paddle = 140; ball = { x: 180, y: 426, dx: 3.1, dy: -3.5 }; k.fx.clear(); fill(); };
    reset(); k.on('pointermove', event => { paddle = clamp(k.point(event as PointerEvent).x - 40, 8, 272); }); k.on('pointerdown', () => { if (over) reset(); }); k.on('keydown', event => { if ((event as KeyboardEvent).key === ' ' && over) reset(); });
    const draw = () => { const c = k.ctx; k.clear();  c.fillStyle = '#273149'; c.fillRect(0, 40, 360, 2); text(c, `SCORE ${score}   LEVEL ${level}`, 180, 27, 15, '#a8b1c5'); bricks.forEach(brick => { c.fillStyle = brick.hp === 2 ? '#8b7cff' : '#70f0c2'; c.fillRect(brick.x, brick.y, 36, 18); }); c.fillStyle = '#f7f9ff'; c.fillRect(paddle, 500, 80, 11); c.beginPath(); c.arc(ball.x, ball.y, 6, 0, 7); c.fill(); k.fx.draw(); if (paused) text(c, 'PAUSED', 180, 280, 28); if (over) { text(c, 'PULSE LOST', 180, 250, 26, '#ff6b7a'); text(c, 'Finish or start a new round', 180, 282, 15); } };
    let lastStep = performance.now(); const loop = (now = lastStep) => { if (now - lastStep < 1000 / 60 - .1) { raf = requestAnimationFrame(loop); return; } lastStep = now - (now - lastStep) % (1000 / 60); if (!paused && !over) { if (k.keys.has('ArrowLeft') || k.keys.has('a')) paddle = clamp(paddle - 6, 8, 272); if (k.keys.has('ArrowRight') || k.keys.has('d')) paddle = clamp(paddle + 6, 8, 272); ball.x += ball.dx; ball.y += ball.dy; if (ball.x < 6 || ball.x > 354) { ball.dx *= -1; services.sound.play('move'); } if (ball.y < 45) ball.dy = Math.abs(ball.dy); if (ball.y > 540) { over = true; services.sound.play('fail'); }
      if (ball.y > 492 && ball.y < 514 && ball.x > paddle - 5 && ball.x < paddle + 85 && ball.dy > 0) { ball.dy = -Math.abs(ball.dy); ball.dx = (ball.x - (paddle + 40)) / 12; k.fx.burst(ball.x, ball.y, '#f7f9ff', 4); services.sound.play('hit'); }
      for (const brick of [...bricks]) if (ball.x > brick.x - 5 && ball.x < brick.x + 41 && ball.y > brick.y - 5 && ball.y < brick.y + 23) { ball.dy *= -1; k.fx.burst(ball.x, ball.y, brick.hp === 2 ? '#8b7cff' : '#70f0c2'); services.sound.play('hit'); if (--brick.hp === 0) { bricks.splice(bricks.indexOf(brick), 1); score += 10 * level; k.score(score); services.sound.play('clear'); } break; }
      if (!bricks.length) { level++; score += 100; k.score(score); ball = { x: 180, y: 426, dx: 3 + level * .15, dy: -3.4 - level * .12 }; fill(); k.fx.flash('#70f0c2'); services.reportComplete(level); services.sound.play('upgrade'); } k.fx.step(); } draw(); raf = requestAnimationFrame(loop); };
    loop(); return { input: command => { if (!paused && !over) paddle = 8 + (command.horizontal + 1) * 132; }, getState: () => ({phase: over ? 'lost' : paused ? 'paused' : 'playing', score, level, paddle, ball: {...ball}, bricks: bricks.length}), pause: () => { paused = true; }, resume: () => { paused = false; }, restart: reset, destroy: () => { cancelAnimationFrame(raf); k.dispose(); } };
  }
};
export default breakout;
