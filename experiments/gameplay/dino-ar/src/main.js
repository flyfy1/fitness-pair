import './style.css';
import { Runner } from '../../../../apps/dino-run/src/engine.js';
import { PoseCamera } from '../../../../apps/dino-run/src/camera.js';
import { setupFullscreen } from '../../../../apps/dino-run/src/fullscreen.js';
import { JumpHeightRecognizer } from '@fitness-pair/action-jump-height';
import { anchorFromPose, drawSkeleton, drawWorld } from './scene.js';

const $ = id => document.getElementById(id);
const runner = new Runner(); runner.setControlMode('motion');
const recognizer = new JumpHeightRecognizer();
let action = null, pose = null, anchor = null, cameraState = 'off';
let awaiting = false, countdown = null, lastPoseAt = 0, lastFrame = 0, lastPaint = 0;
let message = '', error = '', previousStatus = 'ready';
setupFullscreen($('arena'), $('fullscreen'), text => { $('announcement').textContent = text; });

function pause(reason, release = false) {
  runner.command('pause'); awaiting = false; countdown = null; message = reason;
  if (release) camera.stop('paused');
}
const camera = new PoseCamera({
  video: $('camera'),
  onStatus(status) {
    cameraState = status.state;
    if (status.state === 'requesting') {
      recognizer.reset(status); runner.bindMotionSession(status);
      action = null; pose = null; anchor = null; lastPoseAt = 0;
    }
    paint();
  },
  onPose(frame) {
    lastPoseAt = frame.tMs;
    const fresh = performance.now() - frame.tMs < 250;
    pose = fresh ? frame : null;
    const next = recognizer.update(fresh ? frame : { ...frame, joints: {} });
    if (!next) return;
    action = next;
    if (!action.calibrated) anchor = null;
    if (!fresh || action.phase === 'missing' || !action.calibrated) {
      countdown = null;
      if (runner.status === 'running') pause('Tracking changed. Stand steady, then choose Resume run.');
    } else {
      if (!anchor && action.heightRatio < .03) anchor = anchorFromPose(frame, action);
      runner.applyMotion(action);
    }
  },
  onStop() {
    cameraState = 'off'; action = null; pose = null; anchor = null;
    awaiting = false; countdown = null;
    if (runner.status === 'running') pause('Camera stopped. Calibrate again to continue.');
    paint();
  },
  onError(cause) {
    error = ({ NotAllowedError: 'Camera permission denied. Allow access and retry.',
      NotFoundError: 'No camera found. Connect a camera and retry.',
      NotReadableError: 'Camera unavailable. Close other apps using it and retry.' })[cause.name]
      || cause.message || 'Camera tracking failed. Please retry.';
    $('announcement').textContent = error; paint();
  },
});

function start() {
  if (runner.status === 'running') { pause('Paused. Enable the camera to recalibrate.', true); paint(); return; }
  if (runner.status === 'over') { runner.setControlMode('motion'); previousStatus = 'ready'; }
  error = ''; message = ''; awaiting = true; countdown = null;
  if (!camera.active) void camera.start();
  paint();
}

function paint() {
  const running = runner.status === 'running';
  if (runner.status !== previousStatus) {
    previousStatus = runner.status;
    if (runner.status === 'over') {
      camera.stop('round-complete');
      $('announcement').textContent = `Round complete. ${runner.score} points, ${runner.passed} obstacles cleared.`;
    } else if (running) $('announcement').textContent = 'Run started. Jump to lift your marker over the cacti.';
  }
  $('welcome').hidden = camera.active || runner.status !== 'ready';
  $('arena').classList.toggle('floor-lane', !!anchor && anchor.mode === 'full-body');
  $('score').textContent = String(runner.score).padStart(5, '0');
  $('cleared').textContent = runner.passed;
  $('stop').hidden = !camera.active; $('recalibrate').hidden = !camera.running;
  $('tracking').textContent = cameraState === 'ready'
    ? action?.trackingMode === 'upper-body' ? 'Local · upper body / torso movement' : 'Local · full body tracking'
    : `Camera ${cameraState} · local processing`;
  let phase = 'READY WHEN YOU ARE', cue = 'Step back. Leave room to jump.';
  let detail = message || 'Keep shoulders and hips visible. Full body is best.';
  let button = 'Enable camera', disabled = false;
  if (error) { phase = 'CAMERA NEEDS ATTENTION'; cue = 'Let’s get you connected.'; detail = error; button = 'Retry camera'; }
  else if (runner.status === 'over') {
    phase = 'ROUND COMPLETE'; cue = 'Catch your breath. Go again.';
    detail = `${runner.score} points · ${runner.passed} cacti cleared. Camera is off.`; button = 'Calibrate & run again';
  } else if (running) {
    phase = 'YOU ARE IN THE GAME'; cue = 'Lift your marker over the cacti.';
    detail = action?.trackingMode === 'upper-body' ? 'Torso movement controls the marker at your waist.' : 'Jump in place. The glowing marker follows your height.';
    button = 'Pause';
  } else if (camera.active) {
    phase = 'CALIBRATION'; disabled = true; button = 'Calibrating…';
    if (cameraState === 'requesting') { cue = 'Allow camera access.'; detail = 'Your video stays on this device.'; }
    else if (cameraState === 'loading') { cue = 'Loading local tracking…'; detail = 'Keep the camera fixed and leave space above your head.'; }
    else if (action?.phase === 'missing') { cue = action.cue === 'land-and-hold' ? 'Land and stand steady.' : 'Keep shoulders and hips in view.'; detail = 'Tracking is paused. Return to your calibration position.'; }
    else if (!action?.calibrated) {
      cue = action?.stage === 'maximum' ? 'Jump once to set your maximum.' : 'Stand tall and still.';
      detail = action?.cue === 'jump-higher-and-retry' ? 'That movement was too small. Try one clear, comfortable jump.'
        : action?.cue === 'land-and-hold' ? 'Land in the same place and stand steady.' : 'Stand still, then make one maximum comfortable jump and land.';
    } else if (awaiting) {
      phase = 'YOUR WORLD IS READY'; cue = countdown === null ? 'Land and stand steady.' : `Starting in ${Math.max(1, Math.ceil((3000 - (performance.now() - countdown)) / 1000))}`;
      detail = 'Stay in place. Clear cacti with the glowing marker.'; button = 'Get ready…';
    } else {
      phase = 'PAUSED'; cue = 'Ready to step back in?'; detail = message || 'Stand in your calibrated position.';
      button = 'Resume run'; disabled = false;
    }
  }
  $('phase').textContent = phase; $('cue').textContent = cue; $('detail').textContent = detail;
  $('primary').textContent = button; $('primary').disabled = disabled;
  const fraction = action?.calibrated ? action.heightRatio : action?.calibrationProgress ?? 0;
  $('height-bar').style.width = `${fraction * 100}%`;
  $('height').textContent = camera.active ? `${Math.round(fraction * 100)}%` : '—';
  $('height-label').textContent = action?.calibrated ? 'RELATIVE HEIGHT' : 'YOUR JUMP RANGE';
}

$('primary').addEventListener('click', start);
$('stop').addEventListener('click', () => { pause('Camera is off. Calibrate again when ready.', true); paint(); });
$('recalibrate').addEventListener('click', () => {
  pause(''); recognizer.recalibrate(); action = null; anchor = null; awaiting = true; paint();
});
$('debug').addEventListener('change', () => { $('skeleton').hidden = !$('debug').checked; drawSkeleton($('skeleton'), pose); });
window.addEventListener('blur', () => { if (camera.active) pause('Window focus changed. Recalibrate to continue.', true); });
window.addEventListener('pagehide', () => camera.stop('pagehide'));
window.addEventListener('keydown', event => {
  if (event.target.closest('button,input,a,textarea,select') || event.repeat) return;
  if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); if (camera.active) pause('Paused. Recalibrate to continue.', true); }
});
// Compact observability only: no raw camera frames or identifiable landmarks.
window.dinoAR = Object.freeze({ getState: () => ({ ...runner.snapshot(),
  camera: { state: cameraState, stage: action?.stage ?? 'standing', calibrated: action?.calibrated ?? false,
    trackingMode: action?.trackingMode ?? null, heightRatio: action?.heightRatio ?? 0, cue: action?.cue ?? null },
  debug: $('debug').checked, anchored: !!anchor,
  nextObstacleDistance: runner.obstacles[0] ? runner.obstacles[0].x - 116 : null,
}) });

function frame(now) {
  const fresh = lastPoseAt && now - lastPoseAt < 250;
  if (camera.running) {
    if (runner.status === 'running' && !fresh) pause('Tracking is delayed. Stand steady, then resume.');
    if (awaiting && fresh && anchor && action?.calibrated && action.phase !== 'missing' && action.heightRatio < .03) {
      countdown ??= now;
      if (now - countdown >= 3000) { runner.command(runner.status === 'paused' ? 'resume' : 'start'); awaiting = false; countdown = null; }
    } else countdown = null;
  }
  if (runner.status === 'running') runner.step(lastFrame ? (now - lastFrame) / 1000 : 0);
  drawWorld($('world'), runner, anchor);
  drawSkeleton($('skeleton'), fresh ? pose : null);
  if (now - lastPaint > 50) { paint(); lastPaint = now; }
  lastFrame = now; requestAnimationFrame(frame);
}
paint(); requestAnimationFrame(frame);
