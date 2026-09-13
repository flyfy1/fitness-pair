import './style.css';
import { Runner } from '../../../../apps/dino-run/src/engine.js';
import { PoseCamera } from '../../../../apps/dino-run/src/camera.js';
import { setupFullscreen } from '../../../../apps/dino-run/src/fullscreen.js';
import { ShoulderMotionRecognizer } from './shoulder-motion.js';
import { anchorFromPose, drawSkeleton, drawWorld } from './scene.js';

const $ = id => document.getElementById(id);
const runner = new Runner(); runner.setControlMode('motion');
const recognizer = new ShoulderMotionRecognizer();
let action = null, pose = null, groundPose = null, anchor = null, cameraState = 'off';
let awaiting = false, lastPoseAt = 0, lastFrame = 0, lastPaint = 0;
let message = '', error = '', previousStatus = 'ready';
setupFullscreen($('arena'), $('fullscreen'), text => { $('announcement').textContent = text; });

function pause(reason, release = false) {
  runner.command('pause'); awaiting = false; message = reason;
  if (release) camera.stop('paused');
}
const camera = new PoseCamera({
  video: $('camera'),
  onStatus(status) {
    cameraState = status.state;
    if (status.state === 'requesting') {
      recognizer.reset(status); runner.bindMotionSession(status);
      action = null; pose = null; groundPose = null; anchor = null; lastPoseAt = 0;
    }
    paint();
  },
  onPose(frame) {
    lastPoseAt = frame.tMs;
    const fresh = performance.now() - frame.tMs < 250;
    pose = fresh ? frame : null;
    const next = recognizer.update(fresh ? frame : { ...frame, joints: {} });
    if (!next) return;
    const justReady = !action?.calibrated && next.calibrated;
    action = next;
    if (!action.calibrated) {
      anchor = null;
      if (action.cue === 'jump-to-start') groundPose = frame;
      else if (action.stage === 'standing') groundPose = null;
    }
    if (!fresh || action.phase === 'missing' || !action.calibrated) {
      if (runner.status === 'running') pause('Tracking changed. Stand steady, then choose Resume run.');
    } else {
      if (!anchor && groundPose) anchor = anchorFromPose(groundPose, action);
      if (awaiting && anchor && (runner.status === 'ready' || justReady || action.heightRatio < .03)) {
        runner.command(runner.status === 'paused' ? 'resume' : 'start'); awaiting = false;
      }
      runner.applyMotion(action);
    }
  },
  onStop() {
    cameraState = 'off'; action = null; pose = null; groundPose = null; anchor = null;
    awaiting = false;
    if (runner.status === 'running') pause('Camera stopped. Jump once again to continue.');
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
  if (runner.status === 'running') { pause('Paused. Enable the camera and jump once to continue.', true); paint(); return; }
  if (runner.status === 'over') { runner.setControlMode('motion'); previousStatus = 'ready'; }
  error = ''; message = ''; awaiting = true;
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
  $('arena').classList.toggle('floor-lane', !!anchor && anchor.y > .65);
  $('arena').classList.toggle('show-debug', $('debug').checked);
  $('score').textContent = String(runner.score).padStart(5, '0');
  $('cleared').textContent = runner.passed;
  $('stop').hidden = !camera.active; $('recalibrate').hidden = !camera.running;
  $('tracking').textContent = cameraState === 'ready'
    ? 'Local · shoulder movement mode'
    : `Camera ${cameraState} · local processing`;
  $('tracking-detail').hidden = !$('debug').checked;
  $('tracking-detail').textContent = camera.running
    ? `Stage: ${action?.stage ?? 'standing'} · ${action?.visibleShoulders ?? 0}/2 shoulders · ${action?.quality ?? 'waiting-for-pose'} · Input age: ${lastPoseAt ? Math.round(performance.now() - lastPoseAt) + ' ms' : 'waiting'}`
    : 'Camera off';
  let phase = 'READY WHEN YOU ARE', cue = 'Step back. Leave room to jump.';
  let detail = message || 'Keep both shoulders visible. Your waist and feet can stay outside the frame.';
  let button = 'Enable camera', disabled = false;
  if (error) { phase = 'CAMERA NEEDS ATTENTION'; cue = 'Let’s get you connected.'; detail = error; button = 'Retry camera'; }
  else if (runner.status === 'over') {
    phase = 'ROUND COMPLETE'; cue = 'Catch your breath. Go again.';
    detail = `${runner.score} points · ${runner.passed} cacti cleared. Camera is off.`; button = 'Jump & run again';
  } else if (running) {
    phase = 'YOU ARE IN THE GAME'; cue = 'Lift your marker over the cacti.';
    detail = 'Move your upper body up and down. The glowing marker follows your shoulders.';
    button = 'Pause';
  } else if (camera.active) {
    phase = 'JUMP TO START'; disabled = true; button = 'Waiting for your jump…';
    if (cameraState === 'requesting') { cue = 'Allow camera access.'; detail = 'Your video stays on this device.'; }
    else if (cameraState === 'loading') { cue = 'Loading local tracking…'; detail = 'Keep the camera fixed and leave space above your head.'; }
    else if (lastPoseAt && performance.now() - lastPoseAt >= 250) {
      phase = 'WAITING FOR TRACKING'; cue = 'Tracking is catching up.';
      detail = 'Waiting for a fresh camera result before detecting your jump.';
    }
    else if (action?.phase === 'missing') {
      cue = action.cue === 'return-to-starting-height' ? 'Return to your starting height.' : 'Keep both shoulders in view.';
      detail = action.cue === 'face-the-camera' ? 'Face the camera so both shoulders can be seen.' : 'Your waist and feet do not need to be visible.';
    }
    else if (!action || action.stage === 'standing') {
      phase = 'FINDING YOUR POSITION'; cue = 'Stand comfortably for a moment.';
      detail = 'Keep both shoulders visible. Wait for “Jump now”.';
      button = 'Finding your position…';
    }
    else if (!action?.calibrated) {
      cue = 'Jump now to start.';
      detail = 'Hop or lift your upper body. This mode responds to shoulder movement.';
    } else if (awaiting) {
      cue = 'Return to your starting position.'; detail = 'The run resumes when tracking is steady.';
    } else {
      phase = 'PAUSED'; cue = 'Ready to step back in?'; detail = message || 'Stand in your starting position.';
      button = 'Resume run'; disabled = false;
    }
  }
  $('phase').textContent = phase; $('cue').textContent = cue; $('detail').textContent = detail;
  $('primary').textContent = button; $('primary').disabled = disabled;
  const fraction = action?.calibrated ? action.heightRatio : action?.calibrationProgress ?? 0;
  $('height-bar').style.width = `${fraction * 100}%`;
  $('height').textContent = camera.active ? `${Math.round(fraction * 100)}%` : '—';
  $('height-label').textContent = action?.calibrated ? 'MOVEMENT LEVEL' : 'JUMP TO START';
}

$('primary').addEventListener('click', start);
$('stop').addEventListener('click', () => { pause('Camera is off. Jump once again when ready.', true); paint(); });
$('recalibrate').addEventListener('click', () => {
  pause(''); recognizer.recalibrate(); action = null; groundPose = null; anchor = null; awaiting = true; paint();
});
$('debug').addEventListener('change', () => { $('skeleton').hidden = !$('debug').checked; drawSkeleton($('skeleton'), pose); });
window.addEventListener('blur', () => { if (camera.active) pause('Window focus changed. Enable the camera and jump once to continue.', true); });
window.addEventListener('pagehide', () => camera.stop('pagehide'));
window.addEventListener('keydown', event => {
  if (event.target.closest('button,input,a,textarea,select') || event.repeat) return;
  if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); if (camera.active) pause('Paused. Enable the camera and jump once to continue.', true); }
});
// Compact observability only: no raw camera frames or identifiable landmarks.
window.dinoAR = Object.freeze({ getState: () => ({ ...runner.snapshot(),
  camera: { state: cameraState, stage: action?.stage ?? 'standing', calibrated: action?.calibrated ?? false,
    trackingMode: action?.trackingMode ?? null, heightRatio: action?.heightRatio ?? 0, cue: action?.cue ?? null,
    quality: action?.quality ?? null, frameAgeMs: lastPoseAt ? Math.round(performance.now() - lastPoseAt) : null },
  debug: $('debug').checked, anchored: !!anchor,
  anchorMode: anchor?.mode ?? null,
  nextObstacleDistance: runner.obstacles[0] ? runner.obstacles[0].x - 116 : null,
}) });

function frame(now) {
  const fresh = lastPoseAt && now - lastPoseAt < 250;
  if (camera.running) {
    if (runner.status === 'running' && !fresh) pause('Tracking is delayed. Stand steady, then resume.');
  }
  if (runner.status === 'running') runner.step(lastFrame ? (now - lastFrame) / 1000 : 0);
  drawWorld($('world'), runner, anchor);
  drawSkeleton($('skeleton'), fresh ? pose : null);
  if (now - lastPaint > 50) { paint(); lastPaint = now; }
  lastFrame = now; requestAnimationFrame(frame);
}
paint(); requestAnimationFrame(frame);
