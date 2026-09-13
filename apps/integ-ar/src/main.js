import './style.css';
import {arGames} from './catalog.js';
import {modules} from './modules.ts';
import {PoseCamera} from '../../dino-run/src/camera.js';
import {BodyGestures} from '../../dino-run/src/gestures.js';
import {drawBody} from '../../camera-start/src/body-overlay.js';
import {setupFullscreen} from '../../dino-run/src/fullscreen.js';
import {BodyArcadeRecognizer} from '../../../experiments/action-recognition/body-arcade/index.js';
import {createBodyInput} from './input.js';

const $ = id => document.getElementById(id);
const selected = new URLSearchParams(location.search).get('game');
const config = arGames.find(game => selected ? game.slug === selected : location.pathname.split('/').includes(game.id)) || arGames[0];
const recognizer = new BodyArcadeRecognizer(config), gestures = new BodyGestures();
document.title = `${config.title} · Hopmodo`;
$('game-title').textContent = config.title;
$('category').textContent = config.category.toUpperCase() + ' · CAMERA AR';
$('detail').textContent = $('control-help').textContent = config.action;
$('hand').hidden = !config.primary;
let hosted = false;
let phase = 'idle', session = null, round = crypto.randomUUID(), pose = null, action = null, feed = null;
let readySince = null, lastValidAt = -Infinity, pauseReason = null, disposed = false, raf = 0;
const listeners = new Set(), changed = () => listeners.forEach(callback => callback());
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('integ-ar:' + key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('integ-ar:' + key, JSON.stringify(value)); } catch {} },
  remove(key) { try { localStorage.removeItem('integ-ar:' + key); } catch {} },
};
// Original sounds are optional; no microphone or new audio engine is introduced.
const sound = {play() {}, setMuted() {}, stop() {}, muted: true};
const game = modules[config.slug].mount($('source-game'), {storage, sound, random: Math.random,
  reportScore(score) { $('score').textContent = String(score); }, reportComplete() {},
  isReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches});
game.pause();
const sourceCanvas = $('source-game').querySelector('canvas');
const camera = new PoseCamera({video: $('camera'), inferenceTimeoutMs: 3000,
  onStatus(status) {
    if (status.state === 'requesting') {
      session = {sessionId: status.sessionId, source: status.source};
      round = status.sessionId; recognizer.reset(session); gestures.reset(session);
      feed = createBodyInput(session, game); readySince = null; action = null; pose = null;
      game.restart(); game.pause(); setPhase('setup');
      $('start').hidden = true; $('stop').hidden = false; $('camera-error').hidden = true;
      $('instruction').textContent = 'Allow your camera'; $('detail').textContent = 'Waiting for camera permission…';
    } else if (status.state === 'loading') {
      $('instruction').textContent = 'Preparing movement tracking'; $('detail').textContent = 'Loading the local pose model. You can cancel below.';
    } else if (status.state === 'ready') { $('instruction').textContent = 'Stand still'; $('detail').textContent = 'Keep your shoulders, hips and hands visible.'; }
    $('tracking').textContent = status.state === 'ready' ? 'Finding your torso' : status.state === 'loading' ? 'Preparing tracking' : 'Waiting for camera';
  },
  onPose(frame) {
    if (disposed || performance.now() - frame.tMs > 250) return;
    pose = frame; action = recognizer.update(frame); const hands = gestures.update(frame);
    if (!action) return;
    const valid = ['active', 'ready', 'completed'].includes(action.phase);
    $('tracking').textContent = action.phase === 'missing' ? 'Tracking needs attention' : action.phase === 'calibrating' ? 'Calibrating torso' : 'Torso tracked · on device';
    $('movement').textContent = valid ? `Body ${Math.abs(action.controls.horizontal) < .1 ? 'center' : action.controls.horizontal < 0 ? 'left' : 'right'} · ${Math.round(Math.abs(action.controls.horizontal) * 100)}%` : action.cue;
    $('hand').textContent = action.controls.leftRaised ? 'Left hand raised · lower to rearm' : 'Left hand lowered';
    if (valid) lastValidAt = performance.now();
    if (phase === 'setup') {
      $('instruction').textContent = valid ? 'Get ready' : action.phase === 'missing' ? 'Step into view' : 'Stand still';
      $('detail').textContent = valid ? `${Math.max(1, 3 - Math.floor((frame.tMs - (readySince ?? frame.tMs)) / 1000))} · ${config.action}` : action.cue;
      $('calibration').hidden = valid; $('calibration').value = action.calibrationProgress || 0;
      if (valid && !action.controls.leftRaised && !action.controls.rightRaised) {
        readySince ??= frame.tMs;
        if (frame.tMs - readySince >= 3000) { recognizer.release(); game.resume(); setPhase('playing'); }
      } else readySince = null;
    }
    if (phase === 'playing' && !valid) pause('tracking');
    if (hands?.event?.kind === 'both-hands' && ['playing', 'paused'].includes(phase)) togglePause();
    if (phase === 'playing' && valid) feed(action);
    if (phase === 'paused') $('cue').textContent = valid ? 'Tracking ready. Lower your hands, then resume.' : action.cue;
  },
  onStop({reason}) {
    pose = null; action = null; drawBody($('skeleton'), null);
    $('tracking').textContent = 'Camera off';
    $('recalibrate').disabled = true;
    $('stop').hidden = true;
    if (!['complete', 'dispose'].includes(reason)) {
      game.pause(); recognizer.release(); setPhase('idle');
      $('instruction').textContent = 'Camera stopped'; $('detail').textContent = 'Enable the camera to start a fresh round.';
      $('start').textContent = 'Enable camera & play'; $('start').hidden = false; $('stop').hidden = true;
    }
  },
  onError(error) {
    $('instruction').textContent = 'Camera unavailable';
    $('camera-error').textContent = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow access and try again.' : error.message;
    $('camera-error').hidden = false;
  },
});

function setPhase(next) {
  phase = next; $('arena').dataset.phase = next;
  $('panel').hidden = ['playing', 'paused'].includes(next);
  $('setup-copy').hidden = next === 'complete';
  $('pause').disabled = !['playing', 'paused'].includes(next);
  $('pause').textContent = next === 'paused' ? 'Resume' : 'Pause';
  $('recalibrate').disabled = !camera?.running;
  $('finish').hidden = !['playing', 'paused'].includes(next);
  $('cue').textContent = config.action;
  changed();
}
function pause(reason = 'manual') {
  if (phase !== 'playing') return;
  game.pause(); recognizer.release(); pauseReason = reason; setPhase('paused');
  $('cue').textContent = reason === 'tracking' ? 'Tracking lost. Return to view, then resume.' : 'Paused. Lower your hands, then resume.';
}
function togglePause() {
  if (phase === 'playing') { pause(); return; }
  if (phase !== 'paused') return;
  if (!camera.running || performance.now() - lastValidAt > 250 || action?.phase === 'missing') {
    $('cue').textContent = 'Show your shoulders, hips and required hands before resuming.'; return;
  }
  // The resume gesture itself cannot become a primary action; lowering rearms it.
  recognizer.release(); pauseReason = null; game.resume(); setPhase('playing');
}
function finish() {
  if (!['playing', 'paused'].includes(phase)) return;
  game.pause(); const score = game.getState().score;
  setPhase('complete'); camera.stop('complete');
  $('instruction').textContent = 'Round complete'; $('detail').textContent = `${score} points · ${config.title}`;
  $('start').textContent = 'Play again'; $('start').hidden = false; $('stop').hidden = true; $('calibration').hidden = true;
}
$('start').addEventListener('click', () => camera.start());
$('pause').addEventListener('click', togglePause);
$('stop').addEventListener('click', () => camera.stop('stopped'));
$('finish').addEventListener('click', finish);
$('recalibrate').addEventListener('click', () => {
  if (!camera.running) return;
  game.pause(); recognizer.recalibrate(); readySince = null; setPhase('setup');
});
setupFullscreen($('arena'), $('fullscreen'), message => { $('cue').textContent = message; });

function render(now) {
  if (disposed) return;
  const canvas = $('world'), {width, height} = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const footerHeight = height - document.querySelector('.controls').getBoundingClientRect().top;
  $('cue').style.bottom = `${footerHeight + 12}px`;
  const top = height < 550 ? 102 : hosted ? 202 : 130;
  const bottom = footerHeight + $('cue').getBoundingClientRect().height + 28;
  const available = Math.max(80, height - top - bottom), scale = Math.min((width - 32) / sourceCanvas.width, available / sourceCanvas.height);
  const w = sourceCanvas.width * scale, h = sourceCanvas.height * scale;
  if (['playing', 'paused', 'complete'].includes(phase)) ctx.drawImage(sourceCanvas, (width - w) / 2, top + (available - h) / 2, w, h);
  // Clear old bodies when inference stops; never draw a frozen person as live tracking.
  drawBody($('skeleton'), camera.running && pose && now - pose.tMs < 250 ? pose : null);
  if (phase === 'playing' && now - lastValidAt >= 250) pause('tracking');
  const state = game.getState(); $('score').textContent = String(state.score);
  if (phase === 'playing' && ['lost', 'won'].includes(state.phase)) finish();
  raf = requestAnimationFrame(render);
}
function dispose() {
  if (disposed) return;
  disposed = true; camera.stop('dispose'); game.destroy(); cancelAnimationFrame(raf); listeners.clear();
}
window.addEventListener('pagehide', dispose, {once: true});
window.gameplay = {
  getFrame: () => ({round, phase: phase === 'setup' ? 'setup' : phase, canvas: $('world'), video: $('camera'), skeleton: $('skeleton'),
    isAR: true, score: `${game.getState().score} points`, source: session?.source}),
  subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
  configureHost({homeURL, recordingNote}) { hosted = true; $('home').setAttribute('aria-label','Back to the Hopmodo arcade'); if (homeURL) $('home').href = homeURL; if (recordingNote) $('privacy-note').textContent = recordingNote; },
  dispose,
};
window.integAR = {getState: () => ({phase, round, pauseReason, game: game.getState(), action, camera: camera.running})};
raf = requestAnimationFrame(render);
