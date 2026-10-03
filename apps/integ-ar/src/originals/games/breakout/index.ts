// Adapted from flyfy1/integ-games c2a3374; see apps/integ-ar/README.md.
import type { GameModule } from '../../core/game-types';
import { makeKit, text, clayRect, clayBall } from '../arcade-kit';
import { BrickPulseEngine } from './engine.js';

export const breakout: GameModule = {
  meta: {slug: 'breakout', title: 'Brick Pulse', category: 'arcade', description: 'A luminous brick breaker with three lives and escalating pulse rows.', instructions: 'Move the paddle; clear bricks and keep the ball bouncing.', accent: '#70f0c2', mechanic: 'Bounce ball and clear bricks'},
  mount(host, services) {
    const k = makeKit(host, services, 'breakout'), engine = new BrickPulseEngine();
    let raf = 0, paused = false, last = performance.now();
    const reset = () => { engine.reset(); paused = false; last = performance.now(); k.fx.clear(); k.score(0); };
    k.on('pointermove', event => { if (!paused) engine.movePaddle(k.point(event as PointerEvent).x - 40); });
    k.on('pointerdown', () => { if (engine.over) reset(); });
    k.on('keydown', event => { if ((event as KeyboardEvent).key === ' ' && engine.over) reset(); });
    const draw = () => {
      const c = k.ctx, {ball, paddle, score, level, lives, serveRemainingMs, over} = engine;
      k.clear(); c.fillStyle = '#273149'; c.fillRect(0, 40, 360, 2);
      text(c, `SCORE ${score}   LEVEL ${level}`, 180, 27, 15, '#a8b1c5');
      text(c, `LIVES ${lives} / 3`, 180, 58, 13, '#70f0c2');
      for (const brick of engine.bricks) { clayRect(c,brick.x,brick.y,36,18,brick.hp===2?'#e8bd60':'#4ea79b'); }
      clayRect(c,paddle,500,80,11,'#e88e72',5);
      clayBall(c,ball.x,ball.y,6,'#fff0c9'); k.fx.draw();
      if (over) { text(c, 'PULSE LOST', 180, 250, 26, '#ff6b7a'); text(c, 'Finish or start a new round', 180, 282, 15); }
      else if (paused) text(c, 'PAUSED', 180, 280, 28);
      else if (serveRemainingMs > 0) { text(c, `Ball in ${Math.ceil(serveRemainingMs / 1000)}`, 180, 300, 26, '#70f0c2'); text(c, 'Move into position', 180, 329, 15); }
    };
    const loop = (now: number) => {
      const elapsed = now - last; last = now;
      if (!paused && !engine.over) {
        if (k.keys.has('ArrowLeft') || k.keys.has('a')) engine.movePaddle(engine.paddle - Math.min(elapsed, 100) * .36);
        if (k.keys.has('ArrowRight') || k.keys.has('d')) engine.movePaddle(engine.paddle + Math.min(elapsed, 100) * .36);
        for (const event of engine.advance(elapsed)) {
          if (event.kind === 'brick' || event.kind === 'paddle') {
            k.fx.burst(event.x, event.y, event.kind === 'brick' ? '#70f0c2' : '#f7f9ff', 5);
            services.sound.play(event.kind === 'brick' && event.cleared ? 'clear' : 'hit');
          } else if (event.kind === 'wall') services.sound.play('move');
          else if (event.kind === 'level') { k.fx.flash('#70f0c2'); services.reportComplete(engine.level); services.sound.play('upgrade'); }
          else if (event.kind === 'life-lost' || event.kind === 'lost') services.sound.play('fail');
          if (event.kind === 'brick' || event.kind === 'level') k.score(engine.score);
        }
        k.fx.step();
      }
      draw(); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return {
      input: command => { if (!paused) engine.movePaddle(8 + (command.horizontal + 1) * 132); },
      getState: () => ({...engine.snapshot(), phase: engine.over ? 'lost' : paused ? 'paused' : 'playing'}),
      pause: () => { paused = true; }, resume: () => { paused = false; last = performance.now(); },
      restart: reset, destroy: () => { cancelAnimationFrame(raf); k.dispose(); },
    };
  },
};
export default breakout;
