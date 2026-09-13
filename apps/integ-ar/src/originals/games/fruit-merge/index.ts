// Adapted from flyfy1/integ-games c2a3374; see apps/integ-ar/README.md.
import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { clamp, makeKit, text } from '../arcade-kit';

type Fruit = { x: number; y: number; vy: number; level: number };
const colors = ['#70f0c2', '#8b7cff', '#ffcb6b', '#ff8f70', '#ff6b7a', '#b7f57b', '#f1a7ff'];
export const canMergeFruitTier = (tier: number) => tier >= 0 && tier < colors.length - 1;

export const fruitMerge: GameModule = {
  meta: { slug: 'fruit-merge', title: 'Fruit Orbit', category: 'puzzle', description: 'Drop orbiting fruit and grow them into stellar giants.', instructions: 'Drag across the rim and release to drop; use arrows and Space too.', accent: '#ff8f70', mechanic: 'Drop and merge fruit tiers' },
  mount(host: HTMLElement, services: GameServices): GameController {
    const k = makeKit(host, services, 'fruit-merge');
    let raf = 0, paused = false, lost = false, score = 0, level = 1, held = 180, next = 0, moveCooldown = 0, drops = 0;
    let fruits: Fruit[] = [];
    const radius = (tier: number) => 12 + tier * 7;
    const reset = () => { paused = false; lost = false; score = 0; level = 1; held = 180; next = 0; drops = 0; fruits = []; k.fx.clear(); };
    const drop = () => { if (paused || lost) return; if (!fruits.some(f => f.y < 85)) { drops++; fruits.push({ x: held, y: Math.max(62, 48 + radius(next)), vy: 0, level: next }); k.fx.burst(held, 62, colors[next], 4); next = Math.floor(services.random() * Math.min(4, level + 2)); services.sound.play('move'); } };
    k.on('pointermove', event => { held = clamp(k.point(event as PointerEvent).x, 18, 342); });
    k.on('pointerup', drop); k.on('pointerdown', () => { if (lost) reset(); });
    k.on('keydown', event => { const key = (event as KeyboardEvent).key; if (key === ' ' || key === 'Enter') drop(); if (lost && (key === 'r' || key === 'R')) reset(); });
    const draw = () => { const c = k.ctx; k.clear();  c.strokeStyle = '#ff8f70'; c.lineWidth = 3; c.strokeRect(15, 42, 330, 500); text(c, `ORBIT MASS ${score}  ·  TIER ${level}`, 180, 27, 14, '#a8b1c5');
      c.strokeStyle = '#273149'; c.beginPath(); c.moveTo(held, 42); c.lineTo(held, 72); c.stroke(); c.fillStyle = colors[next]; c.beginPath(); c.arc(held, 64, radius(next), 0, 7); c.fill();
      fruits.forEach(f => { c.fillStyle = colors[f.level]; c.beginPath(); c.arc(f.x, f.y, radius(f.level), 0, 7); c.fill(); c.fillStyle = '#ffffff66'; c.beginPath(); c.arc(f.x - radius(f.level) / 3, f.y - radius(f.level) / 3, 3, 0, 7); c.fill(); });
      k.fx.draw(); if (paused) text(c, 'PAUSED', 180, 280, 27); if (lost) { text(c, 'ORBIT OVERFLOW', 180, 260, 23, '#ff6b7a'); text(c, 'Finish or start a new round', 180, 290, 15); }
    };
    let lastStep = performance.now(); const loop = (now = lastStep) => { if (now - lastStep < 1000 / 60 - .1) { raf = requestAnimationFrame(loop); return; } lastStep = now - (now - lastStep) % (1000 / 60); if (!paused && !lost) { moveCooldown--; if (moveCooldown <= 0) { if (k.keys.has('ArrowLeft') || k.keys.has('a')) { held = clamp(held - 14, 18, 342); moveCooldown = 3; } if (k.keys.has('ArrowRight') || k.keys.has('d')) { held = clamp(held + 14, 18, 342); moveCooldown = 3; } }
      fruits.forEach(f => { const r = radius(f.level); f.vy += .22; f.y += f.vy; f.x = clamp(f.x, 15 + r, 345 - r); if (f.y + r > 540) { f.y = 540 - r; f.vy *= -.28; } });
      outer: for (let i = 0; i < fruits.length; i++) for (let j = i + 1; j < fruits.length; j++) { const a = fruits[i], b = fruits[j], d = Math.hypot(a.x - b.x, a.y - b.y), min = radius(a.level) + radius(b.level); if (d < min && d > .01) { const ux = (a.x - b.x) / d, uy = (a.y - b.y) / d, push = (min - d) / 2; a.x += ux * push; a.y += uy * push; b.x -= ux * push; b.y -= uy * push;
        if (a.level === b.level && canMergeFruitTier(a.level) && Math.abs(a.vy - b.vy) < 2.3) { a.x = (a.x + b.x) / 2; a.y = (a.y + b.y) / 2; a.level++; a.vy = -2.4; fruits.splice(j, 1); k.fx.burst(a.x, a.y, colors[a.level], 10); score += (a.level + 1) * 10; k.score(score); services.sound.play('collect'); if (score >= level * 180) { level++; services.reportComplete(level); k.fx.flash('#ff8f70'); services.sound.play('upgrade'); } break outer; } } }
      if (fruits.some(f => f.y - radius(f.level) < 47 && f.vy > .5)) { lost = true; k.fx.flash('#ff6b7a'); services.sound.play('fail'); } k.fx.step(); } draw(); raf = requestAnimationFrame(loop); };
    loop(); return { input: command => { if (!paused && !lost) { held = 18 + (command.horizontal + 1) * 162; if (command.primary) drop(); } }, getState: () => ({phase: lost ? 'lost' : paused ? 'paused' : 'playing', score, level, held, fruitCount: fruits.length, fruits: fruits.map(fruit => ({...fruit})), drops, nextTier: next}), pause: () => { paused = true; }, resume: () => { paused = false; }, restart: reset, destroy: () => { cancelAnimationFrame(raf); k.dispose(); } };
  }
};
export default fruitMerge;
