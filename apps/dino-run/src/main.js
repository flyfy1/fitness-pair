import '../../../packages/gameplay/page-language.js';
import './style.css';
import {createHandsStart} from '../../../packages/gameplay/hands-start-view.js';
import { Runner } from './engine.js';
import {createRunnerMotionInput} from './motion-input.js';
import { Renderer } from './render.js';
import { JumpHeightRecognizer } from '@fitness-pair/action-jump-height';
import { PoseCamera } from './camera.js';
import { BodyGestures } from './gestures.js';
import { setupFullscreen } from './fullscreen.js';

const $ = id => document.getElementById(id);
const runner = new Runner();
const motionInput = createRunnerMotionInput(runner);
runner.setControlMode('motion');
const renderer = new Renderer($('game'), runner);
const recognizer = new JumpHeightRecognizer({ manualMaximum: true, preferUpperBody: true });
const gestures = new BodyGestures();
let gestureState = null, gestureMessage = '', gestureStartRequested = false;
setupFullscreen($('play-area'), $('fullscreen'), message => { $('announcement').textContent = message; });
let mode = 'motion', cameraState = 'off', latestAction = null, lastPoseAt = 0;
let awaitingStart = false, countdownAt = null, cameraError = '', pauseReason = '';
let previousStatus = '', lastFrame = 0, lastPaint = 0;
const storageKey = () => `motion-arcade:dino-run:best:${mode === 'motion' ? 'motion-v1' : 'v1'}`;
function loadBest() {
  try { const n = Number(localStorage.getItem(storageKey())); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0; } catch { return 0; }
}
const startGate = createHandsStart(document.querySelector('#play-area'));
let best = loadBest();
const pad = number => String(number).padStart(5, '0');

const camera = new PoseCamera({
  video: $('camera'),
  onStatus(status) {
    cameraState = status.state;
    if (status.state === 'requesting') {
      const session = { sessionId: status.sessionId, source: status.source };
      startGate.reset(session); recognizer.reset(session); gestures.reset(session); gestureState = null; gestureMessage = ''; gestureStartRequested = false; motionInput.reset(session); latestAction = null;
      lastPoseAt = 0; countdownAt = null; cameraError = '';
    }
    paint();
  },
  onPose(frame) {
    // Freshness is measured from capture, not from when inference finishes.
    lastPoseAt = frame.tMs;
    if (performance.now() - frame.tMs >= 250) {
      latestAction = recognizer.update({ ...frame, joints: {} }) || latestAction;
      gestureState = gestures.update({ ...frame, joints: {} });
      countdownAt = null;
      if (runner.status === 'running') pauseRun('Tracking is delayed. Stand steady, then resume.', false);
      paint(); return;
    }
    const action = recognizer.update(frame);
    if (!action) return;
    latestAction = action;
    gestureState = gestures.update(frame);
    if (gestureState?.neutral && !gestureState.latched) gestureMessage = '';
    if (startGate.update(frame, action.calibrated || action.canConfirmMaximum)) {
      if (!action.calibrated) recognizer.confirmMaximum();
      else handleGesture(gestureState?.event);
    }
    drawSkeleton(frame);
    if (action.phase === 'missing' || !action.calibrated) {
      countdownAt = null;
      if (runner.status === 'running') pauseRun('Tracking changed. Stand in view, then resume.', false);
    } else motionInput.consume(action);
    renderer.draw(); paint();
  },
  onStop({ reason }) {
    startGate.hide();
    cameraState = 'off'; latestAction = null; gestureState = null; gestureMessage = ''; gestureStartRequested = false; awaitingStart = false; countdownAt = null;
    $('skeleton').getContext('2d').clearRect(0, 0, $('skeleton').width, $('skeleton').height);
    if (runner.status === 'running') {
      runner.command('pause'); pauseReason = 'Camera stopped. Recalibrate to continue.';
    }
    if (reason === 'hidden' || reason === 'pagehide') pauseReason = 'Camera stopped while away. Recalibrate to continue.';
    paint();
  },
  onError(error) {
    const messages = {
      NotAllowedError: 'Camera permission denied. Allow access and retry, or use Keyboard mode.',
      NotFoundError: 'No camera found. Connect one and retry, or use Keyboard mode.',
      NotReadableError: 'Camera unavailable. Close other apps using it and retry.',
      TimeoutError: 'Camera tracking timed out. Retry to recalibrate.',
    };
    cameraError = messages[error.name] || 'Could not start camera tracking. Retry or use Keyboard mode.';
    $('announcement').textContent = cameraError; paint();
  },
});

function overlay(kicker, title, copy, button, hint, disabled = false) {
  $('overlay-kicker').textContent = kicker; $('overlay-title').textContent = title;
  $('overlay-copy').textContent = copy; $('start').textContent = button;
  $('start').disabled = disabled; $('overlay-hint').textContent = hint;
}

function paint() {
  const running = runner.status === 'running', paused = runner.status === 'paused';
  if (runner.status !== previousStatus) {
    previousStatus = runner.status;
    if (runner.status === 'over') {
      best = Math.max(best, runner.score);
      try { localStorage.setItem(storageKey(), String(best)); } catch { /* Storage is optional. */ }
      if (mode === 'motion') camera.stop('round-complete');
      $('announcement').textContent = `Game over. Score ${runner.score}. Personal best ${best}.`;
    } else if (running) $('announcement').textContent = mode === 'motion' ? 'Run started. Jump to control Dino’s height.' : 'Run started. Press Space to jump.';
    else if (paused) $('announcement').textContent = 'Game paused.';
    window.dispatchEvent(new CustomEvent('dino:state', { detail: { ...runner.snapshot(), best } }));
  }
  $('score').textContent = pad(runner.score); $('best').textContent = pad(best);
  $('distance').textContent = `${Math.floor(runner.distance)} m`;
  $('pace').textContent = mode === 'motion' ? 'Camera controls · your maximum jump = Dino’s maximum height' : runner.speed > 420 ? 'Picking up speed. Keep your rhythm!' : 'Take it easy. Find your rhythm.';
  $('overlay').hidden = running;
  $('pause').disabled = !running && !paused;
  $('pause').textContent = paused ? '▷' : 'Ⅱ'; $('pause').setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
  $('jump').hidden = mode !== 'keyboard'; $('jump').disabled = !running;
  $('live-state').textContent = { ready: 'READY TO ROAM', running: mode === 'motion' ? 'MOVING TOGETHER' : 'ON THE MOVE', paused: 'TAKE A BREATHER', over: 'UNTIL THE NEXT LEAP' }[runner.status];
  if (runner.status === 'over') overlay('EVERY JUMP IS A NEW START', 'Catch your breath. Go again.', `${runner.score} points · ${runner.passed} obstacles cleared`, mode === 'motion' ? 'Calibrate & run again' : 'Run again', mode === 'motion' ? 'Camera is off. Each camera session starts with calibration.' : 'Press Space for a fresh start');
  else if (mode === 'keyboard') {
    if (paused) overlay('TAKE A BREATHER', 'Adventure can wait.', 'Take your time. Pick up where you left off.', 'Keep running', 'Press P, Esc or Space to resume');
    else if (!running) overlay('READY WHEN YOU ARE', 'Every adventure starts with a leap.', 'Cacti ahead. Jump over them and keep going.', 'Let’s run', 'or press Space to start');
  } else if (!running) {
    if (cameraError) overlay('CAMERA NEEDS ATTENTION', 'Let’s get you connected.', cameraError, 'Retry camera', 'Keyboard mode is also available.');
    else if (cameraState === 'off') overlay('MOVE TO PLAY', paused ? 'Ready to move again?' : 'First, set your jump range.', pauseReason || 'Stand still, then make one maximum comfortable jump.', 'Enable camera', 'Keep the camera fixed, with your shoulders and hips visible.');
    else if (!latestAction?.calibrated) overlay('CALIBRATION', latestAction?.canConfirmMaximum ? 'Height captured. Ready?' : latestAction?.stage === 'maximum' ? 'Set your maximum jump.' : 'Stand tall and still.', cameraState === 'requesting' ? 'Allow camera access in your browser.' : cameraState === 'loading' ? 'Loading the local pose model…' : calibrationCopy().detail, latestAction?.canConfirmMaximum ? 'Use measured height' : 'Calibrating…', 'Raise one hand above your shoulder for 1 second to confirm.', !latestAction?.canConfirmMaximum);
    else if (!awaitingStart) overlay('TAKE A BREATHER', 'Ready when you are.', pauseReason || 'Stand in your calibrated position before continuing.', 'Resume run', 'Raise both hands for 1 second to resume. Then lower your hands.');
    else overlay('CALIBRATION COMPLETE', countdownAt === null ? 'Lower your hands and stand steady.' : `Starting in ${Math.max(1, Math.ceil((3000 - (performance.now() - countdownAt)) / 1000))}`, 'Your maximum jump is now 100%. Small hops make smaller jumps.', 'Get ready…', 'Stay in place. Jump when the run begins.', true);
  }
  paintCalibration();
  paintGestures();
}

function calibrationCopy() {
  if (cameraError) return { title: 'Camera needs attention', detail: cameraError };
  if (cameraState === 'off') return { title: 'Calibrate before you run', detail: 'Keep your shoulders and hips in view; full body works too. Stand still, then jump once to set your maximum comfortable height.' };
  if (cameraState === 'requesting') return { title: 'Allow camera access', detail: 'Only video is requested. Your camera stays on this device.' };
  if (cameraState === 'loading') return { title: 'Loading local tracking', detail: 'Keep the camera fixed. Leave room above your head; your legs may be outside the frame.' };
  if (latestAction?.quality === 'position-changed') return { title: 'Return to your starting position', detail: 'Your body position or size changed. Keep the camera fixed, face it and stand at the same distance.' };
  if (latestAction?.phase === 'missing') return { title: 'Keep shoulders and hips in view', detail: 'Face the camera with both shoulders and hips visible. Legs can stay outside the frame.' };
  if (latestAction?.cue === 'prepare-jump') return { title: 'Ready when you are', detail: 'A small crouch before jumping is OK. Your standing baseline is saved.' };
  if (latestAction?.canConfirmMaximum) return { title: 'Height captured — confirm it', detail: 'Raise one hand above your shoulder for 1 second, or choose Use measured height. You can jump again to record a higher maximum.' };
  if (latestAction?.cue === 'jump-higher-and-retry') return { title: 'Let’s measure that again', detail: 'That jump was too small to calibrate. Stand steady, then try one clear jump.' };
  if (latestAction?.stage === 'maximum' && latestAction.measuredRise > 0) return { title: 'Movement captured', detail: 'Return to your starting height and hold steady. Keep both shoulders and hips visible; your feet do not need to be in view.' };
  if (latestAction?.stage === 'maximum') return { title: 'Jump once to set your maximum', detail: latestAction.cue === 'land-and-hold' ? 'Land and stand steady to finish the measurement.' : 'Make your highest comfortable jump, then land in the same spot.' };
  if (latestAction?.calibrated && latestAction.trackingMode === 'upper-body') return { title: 'Your upper-body range is set', detail: 'Dino follows your torso height. Return to your standing position to bring Dino down.' };
  if (latestAction?.calibrated) return { title: 'Your jump range is set', detail: '50% of your measured height gives Dino 50% height. Landing brings Dino down.' };
  return { title: 'Stand tall and still', detail: 'Keep both shoulders and hips visible and steady for about two seconds.' };
}
function paintCalibration() {
  $('motion-panel').hidden = mode !== 'motion';
  if (mode !== 'motion') return;
  const copy = calibrationCopy();
  $('tracking-mode').textContent = latestAction?.trackingMode === 'upper-body' ? 'UPPER BODY · TORSO MOVEMENT' : latestAction?.trackingMode === 'full-body' ? 'FULL BODY · HIPS + FEET' : 'AUTO · FULL OR UPPER BODY';
  $('calibration-title').textContent = copy.title; $('calibration-copy').textContent = copy.detail;
  $('camera-tag').textContent = cameraState === 'off' ? 'CAMERA OFF' : cameraState === 'ready' ? 'LOCAL · LIVE' : cameraState.toUpperCase();
  const calibrated = latestAction?.calibrated && latestAction.phase !== 'missing';
  $('height-label').textContent = calibrated ? 'JUMP HEIGHT' : 'CALIBRATION';
  const fraction = calibrated ? latestAction.heightRatio : latestAction?.calibrationProgress ?? 0;
  $('height-value').textContent = cameraState === 'off' ? '—' : `${Math.round(fraction * 100)}%`;
  $('height-bar').style.width = `${fraction * 100}%`;
  $('height-detail').textContent = calibrated ? 'Your maximum = 100%' : latestAction?.stage === 'maximum' ? latestAction?.canConfirmMaximum ? 'Height captured · raise one hand to confirm' : 'Jump, return, then raise one hand to confirm' : 'Hold a steady standing pose';
  $('stop-camera').hidden = !camera.active; $('recalibrate').hidden = !camera.running;
  const stage = latestAction?.stage || 'standing';
  for (const step of ['standing', 'maximum', 'ready']) $( `step-${step}` ).classList.toggle('current', camera.active && stage === step);
}

function handleGesture(event) {
  if (!event || mode !== 'motion') return;
  if (event.kind === 'both-hands') {
    if (runner.status === 'running' || awaitingStart && latestAction?.calibrated) {
      awaitingStart = false; countdownAt = null;
      pauseRun('Paused by gesture. Lower your hands, then raise both hands again to resume.');
      gestureMessage = 'Paused · lower hands before another gesture';
    } else if (latestAction?.calibrated) {
      primaryAction(); gestureStartRequested = true; gestureMessage = 'Resume requested · lower your hands for the countdown';
    } else gestureMessage = 'Finish height calibration first. Raise one hand to confirm a captured height.';
  } else if (runner.status !== 'running') {
    if (latestAction?.stage === 'standing') gestureMessage = 'Stand still until your baseline is captured, then make one clear jump.';
    else if (!latestAction?.calibrated) {
      const accepted = primaryAction();
      if (accepted) { gestureStartRequested = true; gestureMessage = 'Height confirmed · lower your hand for the countdown'; }
    } else { primaryAction(); gestureStartRequested = true; gestureMessage = 'Ready · lower your hands for the countdown'; }
  }
}

function paintGestures() {
  $('gesture-controls').hidden = mode !== 'motion';
  $('gesture-progress').style.width = `${(gestureState?.progress ?? 0) * 100}%`;
  $('gesture-status').textContent = cameraState === 'off' ? 'Enable camera once to use body controls.'
    : !gestureState?.tracked ? 'Keep both wrists and shoulders visible for gestures.'
    : gestureState.progress > 0 && !gestureState.event ? `Hold ${gestureState.kind === 'both-hands' ? 'both hands' : 'one hand'}… ${Math.round(gestureState.progress * 100)}%`
    : gestureState.latched ? gestureMessage || 'Lower both hands before another gesture.'
    : gestureMessage || 'One hand: next · Both hands: pause / resume';
}

function pauseRun(reason = '', stopCamera = false) {
  if (runner.command('pause')) { awaitingStart = false; countdownAt = null; pauseReason = reason; }
  if (mode === 'motion' && stopCamera) camera.stop('paused');
  paint(); renderer.draw();
}
function primaryAction() {
  if (mode === 'keyboard') return command({ ready: 'start', running: 'jump', paused: 'resume', over: 'restart' }[runner.status]);
  if (runner.status === 'running') return false;
  if (runner.status === 'over') { runner.setControlMode('motion'); previousStatus = ''; }
  if (camera.running && !latestAction?.calibrated) {
    if (performance.now() - lastPoseAt >= 250 || !recognizer.confirmMaximum()) { gestureMessage = 'Make one clear rise and return before confirming.'; paint(); return false; }
  }
  gestureStartRequested = false; cameraError = ''; pauseReason = ''; awaitingStart = true; countdownAt = null;
  if (!camera.active) void camera.start();
  paint(); return true;
}
function command(action) {
  if (mode === 'motion') {
    if (action === 'pause') { pauseRun(); return true; }
    if (['start', 'resume', 'restart'].includes(action)) return primaryAction();
    return false; // A keyboard or external jump cannot override camera height.
  }
  const accepted = runner.command(action);
  if (accepted) { paint(); renderer.draw(); }
  return accepted;
}
function selectMode(next) {
  camera.stop('mode-change'); mode = next; runner.setControlMode(next);
  best = loadBest(); previousStatus = ''; cameraError = ''; pauseReason = ''; latestAction = null;
  $('motion-mode').setAttribute('aria-pressed', String(next === 'motion'));
  $('keyboard-mode').setAttribute('aria-pressed', String(next === 'keyboard'));
  $('input-title').textContent = next === 'motion' ? 'Jump to move' : 'Take a leap';
  $('input-copy').textContent = next === 'motion' ? 'Your height controls Dino’s height in real time.' : 'Space / ↑ or tap the game.';
  paint(); renderer.draw();
}
function drawSkeleton(frame) {
  const canvas = $('skeleton'), video = $('camera');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const c = canvas.getContext('2d'); c.strokeStyle = '#d9ffb0'; c.lineWidth = 3; c.fillStyle = '#eaffcf';
  const visible = p => p && p.confidence >= .6;
  for (const side of ['left', 'right']) {
    const names = ['Shoulder', 'Hip', 'Knee', 'Ankle'].map(name => side + name);
    for (let i = 1; i < names.length; i++) {
      const a = frame.joints[names[i - 1]], b = frame.joints[names[i]];
      if (visible(a) && visible(b)) { c.beginPath(); c.moveTo(a.x * canvas.width, a.y * canvas.height); c.lineTo(b.x * canvas.width, b.y * canvas.height); c.stroke(); }
    }
  }
  for (const p of Object.values(frame.joints)) if (visible(p)) { c.beginPath(); c.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2); c.fill(); }
}

$('motion-mode').addEventListener('click', event => { selectMode('motion'); event.currentTarget.blur(); });
$('keyboard-mode').addEventListener('click', event => { selectMode('keyboard'); event.currentTarget.blur(); });
$('start').addEventListener('click', () => { primaryAction(); $('start').blur(); });
$('pause').addEventListener('click', () => runner.status === 'paused' ? primaryAction() : pauseRun());
$('stop-camera').addEventListener('click', () => { pauseRun('Camera is off. Calibrate again when ready.'); camera.stop(); });
$('recalibrate').addEventListener('click', () => {
  pauseRun('', false); recognizer.recalibrate(); latestAction = null; awaitingStart = true; countdownAt = null; paint();
});
$('jump').addEventListener('pointerdown', event => { if (event.button === 0) { event.preventDefault(); command('jump'); } });
$('jump').addEventListener('click', event => { if (event.detail === 0) command('jump'); });
$('stage').addEventListener('pointerdown', event => {
  if (mode === 'keyboard' && event.button === 0 && !event.target.closest('button, .overlay-card')) { event.preventDefault(); primaryAction(); }
});
window.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (['Space', 'ArrowUp', 'KeyP', 'Escape'].includes(event.code)) {
    if (event.target.closest('button, a') && event.code === 'Space') return;
    event.preventDefault(); if (event.repeat) return;
    if (event.code === 'Space' || event.code === 'ArrowUp') primaryAction();
    else if (runner.status === 'paused') primaryAction(); else pauseRun();
  }
});
window.addEventListener('blur', () => { if (runner.status === 'running') pauseRun('Window focus changed. Calibrate again to continue.', true); });
window.addEventListener('pagehide', () => camera.stop('pagehide'));
window.addEventListener('fitness:action', event => { if (mode === 'keyboard' && typeof event.detail?.action === 'string') command(event.detail.action); });
window.dinoGame = Object.freeze({ command, getState: () => ({ ...runner.snapshot(), best,
  camera: { state: cameraState, calibrated: latestAction?.calibrated ?? false, stage: latestAction?.stage ?? 'standing', heightRatio: latestAction?.heightRatio ?? 0, cue: latestAction?.cue ?? null, trackingMode: latestAction?.trackingMode ?? null, awaitingStart, canConfirmMaximum: latestAction?.canConfirmMaximum ?? false },
  gesture: gestureState ? { kind: gestureState.kind, progress: gestureState.progress, latched: gestureState.latched } : null,
}) });

function frame(now) {
  if (mode === 'motion' && camera.running) {
    const fresh = lastPoseAt && now - lastPoseAt < 250;
    if (runner.status === 'running' && !fresh) pauseRun('Tracking is delayed. Stand steady, then resume.', false);
    if (awaitingStart && startGate.open && fresh && (gestureStartRequested ? gestureState?.neutral : !gestureState?.tracked || gestureState.neutral) && latestAction?.calibrated && latestAction.phase !== 'missing' && latestAction.heightRatio < .03) {
      countdownAt ??= now;
      if (now - countdownAt >= 3000) { runner.command(runner.status === 'paused' ? 'resume' : 'start'); awaitingStart = false; countdownAt = null; pauseReason = ''; }
    } else countdownAt = null;
  }
  if (runner.status === 'running') { runner.step(lastFrame ? (now - lastFrame) / 1000 : 0); renderer.draw(); }
  if (runner.status !== previousStatus) paint(); // Persist results and release the camera in the collision frame.
  if (now - lastPaint > 50) { paint(); lastPaint = now; }
  lastFrame = now; requestAnimationFrame(frame);
}
paint(); requestAnimationFrame(frame);


// Presentation is independent from game physics and the selected input source.
window.gameplay = Object.freeze({
  getFrame: () => ({round:runner.roundId, phase:runner.status==='running'?'playing':runner.status==='over'?'complete':runner.status==='paused'?'paused':'setup',
    canvas:$('game'), video:$('camera'), isAR:false, score:`${runner.score} points`}),
  configureHost({homeURL,recordingNote}) {
    const home=document.querySelector('.brand');home.href=homeURL;home.target='_top';home.setAttribute('aria-label','Back to the Hopmodo arcade');
    document.querySelector('.camera-note').textContent=recordingNote;
  },
});
window.addEventListener('pagehide',()=>motionInput.dispose());
