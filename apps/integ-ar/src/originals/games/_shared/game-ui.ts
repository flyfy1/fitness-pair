// Adapted from flyfy1/integ-games c2a3374; see apps/integ-ar/README.md.
import type { GameServices } from '../../core/game-types';
type MobileControls = {clear(): void; destroy(): void};

export type Frame = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  root: HTMLDivElement;
  setHud: (value: string) => void;
  setMessage: (value: string) => void;
  on: (target: EventTarget, type: string, fn: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => void;
  destroy: () => void;
  controls: (slug: string) => MobileControls | undefined;
};

const style = (element: HTMLElement, css: Partial<CSSStyleDeclaration>) => Object.assign(element.style, css);

/** A tiny owned DOM/canvas shell shared by the catalog games. It deliberately never touches document-level UI. */
export function makeFrame(host: HTMLElement, accent: string, title: string): Frame {
  const root = document.createElement('div');
  root.tabIndex = 0;
  root.setAttribute('aria-label', title);
  style(root, { width: '100%', maxWidth: '620px', margin: '0 auto', color: '#F7F9FF', fontFamily: 'system-ui, sans-serif', outline: 'none', userSelect: 'none', touchAction: 'none' });
  const hud = document.createElement('div');
  style(hud, { minHeight: '25px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700', letterSpacing: '.04em', padding: '6px 2px 9px' });
  const canvas = document.createElement('canvas');
  canvas.width = 600; canvas.height = 600;
  canvas.setAttribute('role', 'application');
  style(canvas, { width: '100%', aspectRatio: '1', display: 'block', borderRadius: '18px', background: 'transparent', border: `1px solid ${accent}55`, boxShadow: '0 14px 36px #0006' });
  const message = document.createElement('div');
  style(message, { minHeight: '25px', textAlign: 'center', color: '#A8B1C5', fontSize: '13px', padding: '8px 6px 2px' });
  root.append(hud, canvas, message); host.replaceChildren(root);
  const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, AddEventListenerOptions | boolean | undefined]> = [];
  let mobile: MobileControls | undefined;
  return {
    canvas, ctx: canvas.getContext('2d')!, root,
    setHud: value => { hud.textContent = value; }, setMessage: value => { message.textContent = value; },
    on: (target, type, fn, options) => { target.addEventListener(type, fn, options); listeners.push([target, type, fn, options]); },
    controls: () => undefined,
    destroy: () => { mobile?.destroy(); listeners.forEach(([target, type, fn, options]) => target.removeEventListener(type, fn, options)); root.remove(); },
  };
}

export const keyPrevent = (event: KeyboardEvent, keys: string[]) => { if (keys.includes(event.key)) event.preventDefault(); };
export const xy = (canvas: HTMLCanvasElement, event: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) * canvas.width / r.width, y: (event.clientY - r.top) * canvas.height / r.height }; };
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const best = (services: GameServices, key: string, score: number) => { const prior = services.storage.get<number>(key, 0); const value = Math.max(prior, score); if (value !== prior) services.storage.set(key, value); return value; };
export const rr = (services: GameServices, count: number) => Math.floor(services.random() * count);

export function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 12) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}
