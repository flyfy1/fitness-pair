// Adapted from flyfy1/integ-games c2a3374; see apps/integ-ar/README.md.
import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { clamp, makeKit, text } from '../arcade-kit';

const palette = ['#70f0c2', '#8b7cff', '#ffcb6b', '#ff6b7a'];
export const NEIGHBOR_DISTANCE = 44;
export const TOP_ANCHOR_Y = 74;
export type Bubble = { x: number; y: number; color: number };
type FallingBubble = Bubble & { vx: number; vy: number };

const adjacent = (a: Bubble, b: Bubble) => Math.hypot(a.x - b.x, a.y - b.y) <= NEIGHBOR_DISTANCE;

export function connectedSameColor(field: readonly Bubble[], placed: Bubble): Bubble[] {
  const connected: Bubble[] = [];
  const visited = new Set<Bubble>();
  const queue: Bubble[] = [placed];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current) || current.color !== placed.color) continue;
    visited.add(current); connected.push(current);
    field.forEach(candidate => { if (!visited.has(candidate) && candidate.color === placed.color && adjacent(current, candidate)) queue.push(candidate); });
  }
  return connected;
}

export function findUnsupported(field: readonly Bubble[]): Bubble[] {
  const supported = new Set<Bubble>();
  const queue = field.filter(bubble => bubble.y <= TOP_ANCHOR_Y);
  queue.forEach(bubble => supported.add(bubble));
  while (queue.length) {
    const current = queue.shift()!;
    field.forEach(candidate => { if (!supported.has(candidate) && adjacent(current, candidate)) { supported.add(candidate); queue.push(candidate); } });
  }
  return field.filter(bubble => !supported.has(bubble));
}

export const bubble: GameModule = {
  meta: { slug: 'bubble', title: 'Bubble Pop', category: 'puzzle', description: 'Aim charged bubbles into matching clusters.', instructions: 'Drag from the launcher and release to shoot; arrows and Space also work.', accent: '#70f0c2', mechanic: 'Match colored bubbles' },
  mount(host: HTMLElement, services: GameServices): GameController {
    const k = makeKit(host, services, 'bubble'); let raf = 0, paused = false, score = 0, level = 1, shotsFired = 0, over = false, next = 0, aim = { x: 180, y: 140 };
    let flying: { x: number; y: number; dx: number; dy: number; color: number } | null = null, field: Bubble[] = [], falling: FallingBubble[] = [];
    const fillBoard = () => { for (let row = 0; row < Math.min(7, 4 + level); row++) for (let col = 0; col < 8; col++) field.push({ x: 27 + col * 43 + (row % 2) * 20, y: 55 + row * 37, color: Math.floor(services.random() * 4) }); };
    const reset = () => { paused = false; score = 0; level = 1; over = false; next = 0; shotsFired = 0; flying = null; field = []; falling = []; k.fx.clear(); fillBoard(); };
    const shoot = () => { if (paused || over || flying) return; shotsFired++; const dx = aim.x - 180, dy = aim.y - 510, length = Math.hypot(dx, dy) || 1; flying = { x: 180, y: 510, dx: dx / length * (7 + level * .25), dy: dy / length * (7 + level * .25), color: next }; k.fx.burst(180, 510, palette[next], 4); next = Math.floor(services.random() * 4); services.sound.play('shoot'); };
    const setAim = (event: PointerEvent) => { const point = k.point(event); aim = { x: clamp(point.x, 15, 345), y: clamp(point.y, 45, 480) }; };
    k.on('pointermove', event => setAim(event as PointerEvent)); k.on('pointerup', () => over ? reset() : shoot()); k.on('pointerdown', event => { if (!over) setAim(event as PointerEvent); });
    k.on('keydown', event => { const key = (event as KeyboardEvent).key; if (over && (key === ' ' || key === 'Enter' || key === 'r')) { reset(); return; } if (key === 'ArrowLeft' || key === 'a') aim.x = clamp(aim.x - 18, 15, 345); if (key === 'ArrowRight' || key === 'd') aim.x = clamp(aim.x + 18, 15, 345); if (key === 'ArrowUp' || key === 'w') aim.y = clamp(aim.y - 18, 45, 440); if (key === 'ArrowDown' || key === 's') aim.y = clamp(aim.y + 18, 45, 440); if (key === ' ' || key === 'Enter') shoot(); });
    const detach = (bubbles: Bubble[]) => { if (!bubbles.length) return; falling.push(...bubbles.map((item, index) => ({ ...item, vx: (index % 3 - 1) * .45, vy: .8 + (index % 2) * .35 }))); k.fx.burst(bubbles[0].x, bubbles[0].y, '#ffcb6b', Math.min(8, bubbles.length)); services.sound.play('collect'); };
    const attach = (shot: NonNullable<typeof flying>) => { flying = null; const near = field.reduce((best, item) => Math.hypot(shot.x - item.x, shot.y - item.y) < Math.hypot(shot.x - best.x, shot.y - best.y) ? item : best, field[0]); if (near) { const distance = Math.hypot(shot.x - near.x, shot.y - near.y) || 1; shot.x = near.x + (shot.x - near.x) / distance * 36; shot.y = near.y + (shot.y - near.y) / distance * 36; } else shot.y = 55;
      const placed: Bubble = { x: clamp(shot.x, 20, 340), y: Math.max(52, shot.y), color: shot.color }; field.push(placed); k.fx.burst(placed.x, placed.y, palette[placed.color]); services.sound.play('hit'); const group = connectedSameColor(field, placed);
      if (group.length >= 3) { field = field.filter(item => !group.includes(item)); const unsupported = findUnsupported(field); field = field.filter(item => !unsupported.includes(item)); detach(unsupported); score += group.length * 10 + unsupported.length * 5; k.score(score); k.fx.burst(placed.x, placed.y, palette[placed.color], Math.min(12, group.length + 3)); services.sound.play('clear'); if (!field.length) { level++; services.reportComplete(level); k.fx.flash('#70f0c2'); services.sound.play('upgrade'); fillBoard(); } }
    };
    const drawBubble = (item: Bubble, alpha = 1) => { const c = k.ctx; c.globalAlpha = alpha; c.fillStyle = palette[item.color]; c.beginPath(); c.arc(item.x, item.y, 18, 0, 7); c.fill(); c.globalAlpha = 1; };
    const draw = () => { const c = k.ctx; k.clear();  text(c, `POP ${score}  ·  LEVEL ${level}`, 180, 27, 14, '#a8b1c5'); c.strokeStyle = '#f7f9ff'; c.lineWidth = 2; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(180, 510); c.lineTo(aim.x, aim.y); c.stroke(); c.setLineDash([]); field.forEach(item => drawBubble(item)); falling.forEach(item => drawBubble(item, .82)); if (flying) drawBubble(flying); drawBubble({ x: 180, y: 510, color: next }); k.fx.draw(); if (paused) text(c, 'PAUSED', 180, 280, 27); if (over) { text(c, 'BUBBLES DESCENDED', 180, 270, 22, '#ff6b7a'); text(c, 'Finish or start a new round', 180, 300, 15); } };
    let lastStep = performance.now(); const loop = (now = lastStep) => { if (now - lastStep < 1000 / 60 - .1) { raf = requestAnimationFrame(loop); return; } lastStep = now - (now - lastStep) % (1000 / 60); if (!paused && !over) { if (flying) { flying.x += flying.dx; flying.y += flying.dy; if (flying.x < 18 || flying.x > 342) flying.dx *= -1; if (flying.y < 52 || field.some(item => Math.hypot(item.x - flying!.x, item.y - flying!.y) < 35)) attach(flying); } falling.forEach(item => { item.x += item.vx; item.y += item.vy; item.vy += .24; }); falling = falling.filter(item => item.y < 590); if (field.some(item => item.y > 485)) { over = true; k.fx.flash('#ff6b7a'); services.sound.play('fail'); } k.fx.step(); } draw(); raf = requestAnimationFrame(loop); };
    reset(); loop(); return { input: command => { if (!paused && !over) { if (command.aim) aim = {x: 15 + command.aim.x * 330, y: 45 + command.aim.y * 395}; if (command.primary) shoot(); } }, getState: () => ({phase: over ? 'lost' : paused ? 'paused' : 'playing', score, level, aim: {...aim}, shotActive: !!flying, shotsFired, fieldCount: field.length}), pause: () => { paused = true; }, resume: () => { paused = false; }, restart: reset, destroy: () => { cancelAnimationFrame(raf); k.dispose(); } };
  }
};
export default bubble;
