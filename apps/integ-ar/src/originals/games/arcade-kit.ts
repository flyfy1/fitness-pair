import {translateText} from '../../../../../packages/gameplay/i18n.js';
// Adapted from flyfy1/integ-games c2a3374; see apps/integ-ar/README.md.
import type { GameServices } from '../core/game-types';

/** Small canvas helpers shared by the second arcade batch. */
export type Kit = {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number;
  point(e: PointerEvent): { x: number; y: number }; keys: Set<string>;
  on(type: string, fn: EventListenerOrEventListenerObject): void; clear(): void;
  score(value: number): void; dispose(): void;
  fx: { burst(x: number, y: number, color: string, count?: number): void; flash(color: string, life?: number): void; step(): void; draw(): void; clear(): void };
};

export function makeKit(host: HTMLElement, services: GameServices, slug: string, width = 360, height = 560): Kit {
  host.replaceChildren();
  const canvas = document.createElement('canvas');
  canvas.width = width * Math.min(2, devicePixelRatio || 1); canvas.height = height * Math.min(2, devicePixelRatio || 1);
  canvas.style.cssText = 'display:block;width:min(100%,420px);height:auto;aspect-ratio:' + width + '/' + height + ';margin:auto;border-radius:16px;background:transparent;touch-action:none;outline:none';
  canvas.tabIndex = 0; host.append(canvas);
  const ctx = canvas.getContext('2d')!; ctx.scale(canvas.width / width, canvas.height / height);
  const keys = new Set<string>(); const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  const on = (type: string, fn: EventListenerOrEventListenerObject) => { canvas.addEventListener(type, fn, { passive: false }); listeners.push([canvas, type, fn]); };
  const key = (down: boolean): EventListener => e => { const event = e as KeyboardEvent; if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','w','a','s','d','W','A','S','D','Escape'].includes(event.key)) event.preventDefault(); down ? keys.add(event.key) : keys.delete(event.key); };
  on('keydown', key(true)); on('keyup', key(false)); on('pointerdown', () => canvas.focus());
  const bestKey = slug + '-best';
  const score = (value: number) => { const old = services.storage.get(bestKey, 0); if (value > old) services.storage.set(bestKey, value); services.reportScore(value); };
  type Effect = { x: number; y: number; dx: number; dy: number; life: number; max: number; color: string; flash: boolean };
  let effects: Effect[] = [];
  const fx = {
    burst(x: number, y: number, color: string, count = 7) { if (services.isReducedMotion) { effects.push({ x, y, dx: 0, dy: 0, life: 1, max: 1, color, flash: true }); return; } for (let index = 0; index < count; index++) { const angle = Math.PI * 2 * index / count; effects.push({ x, y, dx: Math.cos(angle) * (1.2 + (index % 3)), dy: Math.sin(angle) * (1.2 + (index % 2)), life: 18, max: 18, color, flash: false }); } },
    flash(color: string, life = 10) { effects.push({ x: width / 2, y: height / 2, dx: 0, dy: 0, life: services.isReducedMotion ? 1 : life, max: services.isReducedMotion ? 1 : life, color, flash: true }); },
    step() { effects = effects.filter(effect => { effect.life--; effect.x += effect.dx; effect.y += effect.dy; return effect.life > 0; }); },
    draw() { const alpha = kctx.globalAlpha; effects.forEach(effect => { kctx.globalAlpha = Math.max(.08, effect.life / effect.max) * .15; kctx.strokeStyle = effect.color; kctx.fillStyle = effect.color; if (effect.flash) { kctx.fillRect(0, 0, width, height); } else { kctx.fillRect(effect.x - 2, effect.y - 2, 4, 4); } }); kctx.globalAlpha = alpha; },
    clear() { effects = []; }
  };

  const kctx = ctx;
  return { canvas, ctx, width, height, keys, on, score, fx, point: e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX-r.left)*width/r.width, y: (e.clientY-r.top)*height/r.height }; }, clear: () => ctx.clearRect(0,0,width,height), dispose: () => { fx.clear(); listeners.forEach(([t,n,f]) => t.removeEventListener(n,f)); canvas.remove(); } };
}


export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 16, color = '#f7f9ff', align: CanvasTextAlign = 'center') { ctx.fillStyle=color; ctx.font=`700 ${size}px system-ui`; ctx.textAlign=align; ctx.fillText(translateText(value),x,y); }
export function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
