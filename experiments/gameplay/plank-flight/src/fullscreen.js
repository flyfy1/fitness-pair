import {t} from './i18n.js';
// Adapted from apps/dino-run/src/fullscreen.js.
/** Prefer browser fullscreen, with an in-window fallback for embedded browsers. */
export function setupFullscreen(area, button, announce) {
  let expanded = false, pending = false, exitedAt = -Infinity;
  const active = () => document.fullscreenElement === area || expanded;
  const refresh = () => {
    const enabled = active();
    if (!enabled) announce('');
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? t('Exit fullscreen') : t('Enter fullscreen'));
    button.title = enabled ? t('Exit fullscreen') : t('Enter fullscreen');
    button.textContent = enabled ? '↙' : '⛶';
    document.body.classList.toggle('game-expanded', expanded);
    area.classList.toggle('is-expanded', expanded);
  };
  const exitExpanded = () => { expanded = false; exitedAt = performance.now(); refresh(); };
  button.addEventListener('click', async () => {
    if (pending) return;
    pending = true;
    try {
      if (expanded) exitExpanded();
      else if (document.fullscreenElement === area) await document.exitFullscreen();
      else {
        try {
          if (!area.requestFullscreen || document.fullscreenEnabled === false) throw new Error('Fullscreen unavailable');
          await area.requestFullscreen();
        } catch {
          expanded = true;
          announce(t('Browser fullscreen is unavailable. The game still fills this window. Use the exit button or Escape to leave expanded view.'));
        }
      }
    } catch { announce(t('Use Escape to exit fullscreen.')); } finally { pending = false; button.blur(); refresh(); }
  });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement !== area) exitedAt = performance.now();
    refresh();
  });
  // Escape exits the view; it must never accidentally resume a paused game.
  window.addEventListener('keydown', event => {
    if (event.code !== 'Escape') return;
    if (expanded) { event.preventDefault(); event.stopImmediatePropagation(); exitExpanded(); }
    else if (document.fullscreenElement === area || performance.now() - exitedAt < 250) event.stopImmediatePropagation();
  }, true);
  refresh();
}
