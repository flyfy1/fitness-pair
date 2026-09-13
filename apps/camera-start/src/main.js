import './style.css';
import { PoseCamera } from '../../dino-run/src/camera.js';
import { BodyGestures } from '../../dino-run/src/gestures.js';
import { setupFullscreen } from '../../dino-run/src/fullscreen.js';
import { JumpHeightRecognizer } from '@fitness-pair/action-jump-height';
import { createDiagnostics } from './diagnostics.js';

const $ = id => document.getElementById(id);
const recognizer = new JumpHeightRecognizer({ manualMaximum: true, preferUpperBody: true });
const gestures = new BodyGestures();
const diagnostics = createDiagnostics();
let cameraState = 'off', action = null, hands = null, lastPoseAt = 0, countdownAt = null;
let complete = false, error = '', view = {}, lastViewKey = '', previousStage = null;
const log = (event, detail = {}) => { diagnostics.append(event, detail); paintLog(); };
log('app-opened');
setupFullscreen($('setup'), $('fullscreen'), message => { $('announcement').textContent = message; log('fullscreen-message', { message }); });

// The video fills the viewport. Do not count joints cropped out of the visible camera.
function visibleFrame(frame) {
  const { width, height } = $('camera').getBoundingClientRect();
  const scale = Math.max(width / frame.image.width, height / frame.image.height);
  const insetX = (frame.image.width - width / scale) / (2 * frame.image.width);
  const insetY = (frame.image.height - height / scale) / (2 * frame.image.height);
  return { ...frame, joints: Object.fromEntries(Object.entries(frame.joints).filter(([, p]) =>
    p.x > insetX + .015 && p.x < 1 - insetX - .015 && p.y > insetY + .015 && p.y < 1 - insetY - .015)) };
}

const camera = new PoseCamera({
  video: $('camera'),
  onStatus(status) {
    cameraState = status.state; log('camera-state', { state: cameraState });
    if (cameraState === 'requesting') {
      recognizer.reset(status); gestures.reset(status); action = null; hands = null;
      lastPoseAt = 0; countdownAt = null; previousStage = null;
    }
    paint();
  },
  onPose(input) {
    lastPoseAt = input.tMs;
    const stale = performance.now() - input.tMs >= 250;
    const frame = stale ? { ...input, joints: {} } : visibleFrame(input);
    const next = recognizer.update(frame);
    if (!next) return;
    action = next; hands = gestures.update(frame);
    if (action.stage !== previousStage) {
      log('calibration-stage', { from: previousStage, to: action.stage, quality: action.quality });
      previousStage = action.stage;
    }
    if (hands?.event) {
      log('gesture', { kind: hands.event.kind, inputSeq: input.seq });
      if (hands.event.kind === 'one-hand' && !action.calibrated) confirm('gesture');
    }
    paint();
  },
  onStop({ reason }) {
    cameraState = 'off'; action = null; hands = null; countdownAt = null; lastPoseAt = 0;
    log('camera-stopped', { reason }); paint();
  },
  onError(err) {
    error = err.name === 'NotAllowedError' ? 'Allow camera access, then try again.'
      : err.name === 'NotFoundError' ? 'Connect a camera, then try again.'
      : 'Check your camera, then try again.';
    log('camera-error', { name: err.name, message: err.message }); paint();
  },
});

function start() {
  complete = false; error = ''; countdownAt = null;
  log('setup-start-requested'); void camera.start();
}
function confirm(via) {
  if (!lastPoseAt || performance.now() - lastPoseAt >= 250 || !recognizer.confirmMaximum()) {
    log('confirmation-rejected', { via, reason: !lastPoseAt || performance.now() - lastPoseAt >= 250 ? 'stale-tracking' : 'height-not-ready', stage: action?.stage ?? null, cue: action?.cue ?? null });
    return false;
  }
  log('height-confirmed', { via }); paint(); return true;
}
function presentation(now) {
  if (complete) return { stage: 'complete', status: 'SETUP COMPLETE', title: 'Ready to play!', detail: 'You finished every step.', feedback: 'POC complete · camera is now off', button: 'Try again', step: 'ready' };
  if (error) return { stage: 'error', status: 'CAMERA NEEDS ATTENTION', title: 'Let’s try again.', detail: error, feedback: 'Your progress log is available below.', button: 'Retry camera' };
  if (cameraState === 'off') return { stage: 'off', status: 'LET’S GET YOU READY', title: 'Stand back.\nWe’ll guide you.', detail: 'One step at a time. Follow the big words.', feedback: 'Camera stays on your device. No recording.', button: 'Enable camera' };
  if (cameraState === 'requesting') return { stage: 'loading', status: 'CAMERA PERMISSION', title: 'Allow your camera.', detail: 'Choose Allow in the browser prompt.', feedback: 'Then step back where you can see the screen.' };
  if (cameraState === 'loading') return { stage: 'loading', status: 'GETTING READY', title: 'One moment…', detail: 'Starting your camera tracking.', feedback: 'Keep your shoulders and hips in view.' };
  if (!lastPoseAt || now - lastPoseAt >= 250) return { stage: 'missing', status: 'WAITING FOR LIVE TRACKING', title: 'Tracking paused.', detail: 'Stay in view. We’re waiting for a fresh frame.', feedback: 'Nothing will start until tracking returns.', reason: 'stale-tracking' };
  if (!action || action.phase === 'missing') return { stage: 'missing', status: 'WE NEED TO SEE YOU', title: action?.quality === 'position-changed' ? 'Return to your spot.' : 'Step into view.', detail: 'Show both shoulders and hips. Face the camera.', feedback: 'Your legs can stay outside the picture.', reason: action?.quality ?? 'missing-body' };
  if (action.stage === 'standing') return { stage: 'standing', status: 'STEP 1 OF 3 · FIND YOUR BASELINE', title: 'Stand tall.\nHold still.', detail: 'Stay where you are for two seconds.', feedback: action.quality === 'unstable-stance' ? 'Keep your shoulders and hips steady.' : 'We can see you. Keep holding…', progress: (action.calibrationProgress ?? 0) * 2, step: 'standing', reason: action.quality };
  if (action.stage === 'maximum') {
    if (action.canConfirmMaximum) {
      const holding = hands?.kind === 'one-hand' && !hands.latched;
      return { stage: 'confirm', status: 'HEIGHT CAPTURED', title: holding ? 'Keep your hand up.' : 'Raise ONE hand.', detail: holding ? 'Hold it above your shoulder for one second.' : 'Keep your other hand down. Hold for one second.', feedback: !hands?.tracked ? 'Show both hands — or use the button.' : 'This confirms your height and starts the countdown.', progress: holding ? hands.progress : 0, button: 'Confirm & continue', step: 'confirm', reason: hands?.tracked ? 'awaiting-confirmation' : 'missing-hands' };
    }
    const moving = action.measuredRise > 0 && action.cue !== 'jump-higher-and-retry';
    return { stage: 'maximum', status: 'STEP 2 OF 3 · SET YOUR JUMP', title: moving ? 'Back to your spot.' : action.cue === 'jump-higher-and-retry' ? 'A little higher.' : 'Jump once.', detail: moving ? 'Return to your starting height. Hold steady.' : 'Make your highest comfortable jump.', feedback: moving ? 'Movement captured. Waiting for your return…' : 'Then land in the same place. Take your time.', step: 'maximum', reason: action.cue };
  }
  const steady = action.calibrated && action.heightRatio < .03;
  if (!steady) return { stage: 'ready', status: 'HEIGHT CONFIRMED', title: 'Stand steady.', detail: 'Return to your starting height to begin.', feedback: 'Your height is saved. Waiting for a steady pose.', step: 'ready', reason: 'not-grounded' };
  if (countdownAt === null) { countdownAt = now; log('countdown-started'); }
  const remaining = Math.max(1, Math.ceil((3000 - (now - countdownAt)) / 1000));
  return { stage: 'countdown', status: 'HEIGHT CONFIRMED · GET READY', title: String(remaining), detail: 'Stand steady. You’re ready to go.', feedback: 'No extra hand gesture needed.', progress: (now - countdownAt) / 3000, step: 'ready' };
}
function paint() {
  const now = performance.now();
  const next = presentation(now);
  if (next.stage !== 'countdown' && countdownAt !== null) {
    log('countdown-interrupted', { reason: next.reason ?? next.stage }); countdownAt = null;
  }
  const key = [next.stage, next.title, next.reason].join('|');
  view = next;
  if (key !== lastViewKey) {
    lastViewKey = key; log('screen-state', { stage: next.stage, instruction: next.title, reason: next.reason ?? null });
    $('announcement').textContent = `${next.status}. ${next.title}. ${next.detail}`;
  }
  $('setup').dataset.stage = next.stage;
  $('status').textContent = next.status; $('instruction').textContent = next.title;
  $('detail').textContent = next.detail; $('feedback').textContent = next.feedback;
  $('primary').hidden = !next.button; $('primary').textContent = next.button ?? '';
  $('stop').hidden = !camera.active;
  $('progress').hidden = next.progress === undefined;
  const progress = Math.round(Math.max(0, Math.min(1, next.progress ?? 0)) * 100);
  $('progress-fill').style.width = `${progress}%`; $('progress').setAttribute('aria-valuenow', String(progress));
  const steps = ['standing', 'maximum', 'confirm', 'ready'], index = steps.indexOf(next.step);
  steps.forEach((step, i) => { const el = $(`step-${step}`); if (i === index) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); el.classList.toggle('done', i < index); });
}
function paintLog() {
  const target = $('log-entries');
  if (target && !$('diagnostics').hidden) target.textContent = diagnostics.entries().slice(-40).reverse().map(e => JSON.stringify(e)).join('\n');
}
$('primary').addEventListener('click', () => { if (camera.running && action?.canConfirmMaximum) confirm('button'); else if (!camera.active) start(); });
$('stop').addEventListener('click', () => { complete = false; camera.stop('user-stop'); });
$('show-log').addEventListener('click', () => { $('diagnostics').hidden = !$('diagnostics').hidden; $('show-log').setAttribute('aria-expanded', String(!$('diagnostics').hidden)); paintLog(); });
$('close-log').addEventListener('click', () => { $('diagnostics').hidden = true; $('show-log').setAttribute('aria-expanded', 'false'); });
$('clear-log').addEventListener('click', () => { diagnostics.clear(); paintLog(); });
$('export-log').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([diagnostics.export()], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'camera-start-log.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.cameraSetup = Object.freeze({ getState: () => ({ stage: view.stage, reason: view.reason ?? null, camera: cameraState, calibration: action?.stage ?? null, heightConfirmed: action?.calibrated ?? complete, canConfirm: action?.canConfirmMaximum ?? false }), getLog: () => diagnostics.entries() });
function tick() {
  if (camera.running) {
    paint();
    if (countdownAt !== null && performance.now() - countdownAt >= 3000) {
      complete = true; log('setup-completed'); camera.stop('setup-complete'); paint();
    }
  }
  requestAnimationFrame(tick);
}
paint(); requestAnimationFrame(tick);
