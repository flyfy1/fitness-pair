import './style.css';
import { Runner } from './engine.js';
import { Renderer } from './render.js';

const $ = id => document.getElementById(id);
const runner = new Runner();
const renderer = new Renderer($('game'), runner);
const storageKey = 'motion-arcade:dino-run:best:v1';
let best = 0;
try { best = Math.max(0, Number(localStorage.getItem(storageKey)) || 0); } catch { /* Storage is optional. */ }
let previousStatus = '', lastFrame = 0, announcedRecord = false;
const pad = number => String(number).padStart(5, '0');

function sync() {
  $('score').textContent = pad(runner.score); $('best').textContent = pad(best);
  $('distance').textContent = `${Math.floor(runner.distance)} m`;
  $('pace').textContent = runner.speed > 420 ? 'Picking up speed. Keep your rhythm!' : 'Take it easy. Find your rhythm.';
  if (runner.status === previousStatus) return;
  previousStatus = runner.status;
  const running = runner.status === 'running', paused = runner.status === 'paused';
  $('overlay').hidden = running; $('pause').disabled = !running && !paused; $('jump').disabled = !running;
  $('pause').textContent = paused ? '▷' : 'Ⅱ'; $('pause').setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
  $('live-state').textContent = {ready:'READY TO ROAM', running:'ON THE MOVE', paused:'TAKE A BREATHER', over:'UNTIL THE NEXT LEAP'}[runner.status];
  if (runner.status === 'over') {
    announcedRecord = runner.score > best;
    best = Math.max(best, runner.score); $('best').textContent = pad(best);
    try { localStorage.setItem(storageKey, String(best)); } catch { /* Continue if disabled/full. */ }
    $('overlay-kicker').textContent = announcedRecord ? 'A NEW PERSONAL BEST' : 'EVERY JUMP IS A NEW START';
    $('overlay-title').textContent = announcedRecord ? 'A new best. Nicely done!' : 'Catch your breath. Go again.';
    $('overlay-copy').textContent = `${runner.score} points · ${runner.passed} obstacles cleared`;
    $('start').innerHTML = 'Run again <span>↗</span>';
    $('overlay-hint').textContent = 'Press Space for a fresh start';
    $('announcement').textContent = `Game over. Score: ${runner.score}. Personal best: ${best}. Run again when ready.`;
  } else if (paused) {
    $('overlay-kicker').textContent = 'TAKE A BREATHER'; $('overlay-title').textContent = 'Adventure can wait.';
    $('overlay-copy').textContent = 'Take your time. Pick up where you left off.'; $('start').innerHTML = 'Keep running <span>↗</span>';
    $('overlay-hint').textContent = 'Press P, Esc or Space to resume'; $('announcement').textContent = 'Game paused';
  } else if (running) $('announcement').textContent = 'Game started. Press Space, Arrow Up, or tap the game to jump.';
  window.dispatchEvent(new CustomEvent('dino:state', { detail: { ...runner.snapshot(), best } }));
}

// All input adapters use this one command boundary. It never implicitly resumes.
function command(action) {
  const accepted = runner.command(action);
  if (accepted) { sync(); renderer.draw(); }
  return accepted;
}
function primaryAction() {
  command({ ready: 'start', running: 'jump', paused: 'resume', over: 'restart' }[runner.status]);
}
$('start').addEventListener('click', () => { primaryAction(); $('start').blur(); });
$('pause').addEventListener('click', () => command(runner.status === 'paused' ? 'resume' : 'pause'));
$('jump').addEventListener('pointerdown', event => { if (event.button === 0) { event.preventDefault(); command('jump'); } });
$('jump').addEventListener('click', event => { if (event.detail === 0) command('jump'); });
$('stage').addEventListener('pointerdown', event => {
  if (event.button === 0 && !event.target.closest('button, .overlay-card')) { event.preventDefault(); primaryAction(); }
});
window.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (['Space', 'ArrowUp', 'KeyP', 'Escape'].includes(event.code)) {
    if (event.target.closest('button, a') && event.code === 'Space') return;
    event.preventDefault(); if (event.repeat) return;
    if (event.code === 'Space' || event.code === 'ArrowUp') primaryAction();
    else command(runner.status === 'paused' ? 'resume' : 'pause');
  }
});
window.addEventListener('blur', () => command('pause'));
document.addEventListener('visibilitychange', () => { if (document.hidden) command('pause'); });
window.addEventListener('fitness:action', event => {
  if (typeof event.detail?.action === 'string') command(event.detail.action);
});
window.dinoGame = Object.freeze({ command, getState: () => ({ ...runner.snapshot(), best }) });

function frame(now) {
  if (runner.status === 'running') {
    runner.step(lastFrame ? (now - lastFrame) / 1000 : 0);
    sync(); renderer.draw();
  }
  lastFrame = now; requestAnimationFrame(frame);
}
sync(); requestAnimationFrame(frame);
