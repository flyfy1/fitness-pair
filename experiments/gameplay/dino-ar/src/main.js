import {mountGameEntry} from '../../../../packages/gameplay/entry-view.js';
import '../../../../packages/gameplay/page-language.js';
import {createRunnerMotionInput} from '../../../../apps/dino-run/src/motion-input.js';
import './style.css';
import {BodyGestures} from '../../../../packages/gameplay/body-gestures.js';
import {createHandsStart} from '../../../../packages/gameplay/hands-start-view.js';
import { Runner } from '../../../../apps/dino-run/src/engine.js';
import { PoseCamera } from '../../../../apps/dino-run/src/camera.js';
import { setupFullscreen } from '../../../../apps/dino-run/src/fullscreen.js';
import { ShoulderMotionRecognizer } from './shoulder-motion.js';
import { KeyboardInput } from './keyboard-input.js';
import { sceneGeometry, drawSkeleton, drawWorld } from './scene.js';
import {createTrackingPublisher} from '../../../../packages/gameplay/tracking.js';

const $ = id => document.getElementById(id);
const startGate = createHandsStart($('arena'),{countdownMs:3000});
const gestures=new BodyGestures({oneHandSide:'left'});
const runner = new Runner(); runner.setControlMode('motion');
const motionInput=createRunnerMotionInput(runner);
const recognizer = new ShoulderMotionRecognizer(), keyboard = new KeyboardInput();
let inputMode = 'keyboard', action = null, pose = null, cameraState = 'off';
let awaiting = false, lastPoseAt = 0, lastFrame = 0, lastPaint = 0;
let message = '', error = '', previousStatus = 'ready';
let lastPassed = 0, clearedAt = -Infinity, bestLift = 0;
const trackingPublisher = createTrackingPublisher();
let presentationSession = {sessionId: crypto.randomUUID(), source: {kind: 'synthetic', id: 'keyboard-preview'}};
setupFullscreen($('arena'), $('fullscreen'), text => { $('announcement').textContent = text; });

function pause(reason, release = false) {
  runner.command('pause'); awaiting = false; message = reason;
  if (release && camera.active) camera.stop('paused');
}

// Both inputs feed this boundary. The game never interprets keys or landmarks.
function consumeAction(next) {
  if (!next) return;
  const justReady = !action?.calibrated && next.calibrated;
  action = next; bestLift = action.bestHeightRatio;
  if (action.phase === 'missing' || !action.calibrated) {
    if (runner.status === 'running') pause('Tracking changed. Stand steady, then choose Resume run.');
  } else {
    if (awaiting && (inputMode === 'keyboard' || startGate.open) && (runner.status === 'ready' || justReady || action.heightRatio < .03)) {
      runner.command(runner.status === 'paused' ? 'resume' : 'start'); awaiting = false;
    }
    motionInput.consume(action);
  }
}
const camera = new PoseCamera({
  video: $('camera'),
  onStatus(status) {
    if (inputMode !== 'camera') return;
    cameraState = status.state;
    if (status.state === 'requesting') {
      presentationSession = {sessionId: status.sessionId, source: status.source};
      startGate.reset(status); gestures.reset(status); recognizer.reset(status); motionInput.reset(status);
      action = null; pose = null; lastPoseAt = 0; bestLift = 0;
    }
    paint();
  },
  onPose(frame) {
    if (inputMode !== 'camera') return;
    trackingPublisher.emit(frame);
    lastPoseAt = frame.tMs;
    const fresh = performance.now() - frame.tMs < 250;
    pose = fresh ? frame : null;
    const next=recognizer.update(fresh ? frame : { ...frame, joints: {} });
    startGate.update(frame, fresh && next?.calibrated, gestures.update(fresh?frame:{...frame,joints:{}}));
    consumeAction(next);
  },
  onStop() {
    startGate.hide();
    cameraState = 'off';
    if (inputMode !== 'camera') return;
    action = null; pose = null; awaiting = false;
    if (runner.status === 'running') pause('Camera stopped. Enable the camera again to continue.');
    paint();
  },
  onError(cause) {
    if (inputMode !== 'camera') return;
    error = ({ NotAllowedError: 'Camera permission denied. Allow access and retry.',
      NotFoundError: 'No camera found. Connect a camera and retry.',
      NotReadableError: 'Camera unavailable. Close other apps using it and retry.' })[cause.name]
      || cause.message || 'Camera tracking failed. Please retry.';
    $('announcement').textContent = error; paint();
  },
});

function start() {
  if (runner.status === 'running') {
    pause(inputMode === 'keyboard' ? 'Press Space or Resume run to continue.' : 'Enable the camera and stand in view to continue.', true);
    paint(); return;
  }
  if (runner.status === 'over') {
    runner.setControlMode('motion'); previousStatus = 'ready'; clearedAt = -Infinity; lastPassed = 0;
  }
  error = ''; message = ''; awaiting = true;
  if (inputMode === 'keyboard') {
    if (runner.status === 'ready') {
      keyboard.reset(crypto.randomUUID()); presentationSession = keyboard.session; motionInput.reset(keyboard.session);
      action = null; bestLift = 0;
      consumeAction(keyboard.update(performance.now()));
    } else { runner.command('resume'); awaiting = false; }
    $('arena').focus({ preventScroll: true });
  } else if (!camera.active) void camera.start();
  paint();
}
function jump() {
  if (inputMode !== 'keyboard') return;
  if (runner.status !== 'running') start();
  if (runner.status === 'running') keyboard.jump(Number($('jump-range').value) / 100);
  $('arena').focus({ preventScroll: true });
}

function paint() {
  const running = runner.status === 'running', simulated = inputMode === 'keyboard';
  if (runner.status !== previousStatus) {
    previousStatus = runner.status;
    if (runner.status === 'over') {
      if (camera.active) camera.stop('round-complete');
      $('announcement').textContent = `Round complete. ${runner.score} points, ${runner.passed} obstacles cleared.`;
    } else if (running) $('announcement').textContent = simulated
      ? 'Keyboard preview started. Space or Arrow Up to jump. Input is simulated.'
      : 'Run started. Jump to lift your dinosaur over the cacti.';
  }
  if (runner.passed > lastPassed) clearedAt = performance.now();
  lastPassed = runner.passed;
  $('score').textContent = String(runner.score).padStart(5, '0'); $('cleared').textContent = runner.passed;
  $('stop').hidden = !camera.active; $('recalibrate').hidden = !camera.running;
  $('jump').hidden = !simulated || !running; $('keyboard-options').hidden = !simulated;
  $('input-note').textContent = simulated ? 'SIMULATED INPUT' : 'LOCAL CAMERA INPUT';
  $('debug-label').textContent = simulated ? 'Debug · show hitboxes' : 'Debug · show body skeleton';
  $('tracking').textContent = simulated ? 'Keyboard preview · simulated movement · camera off'
    : cameraState === 'ready' ? 'Local · shoulder movement mode' : `Camera ${cameraState} · local processing`;
  $('tracking-detail').hidden = !$('debug').checked;
  $('tracking-detail').textContent = simulated
    ? `Source: synthetic · ${action?.phase ?? 'ready'} · ${runner.jumps} completed jumps`
    : camera.running ? `Stage: ${action?.stage ?? 'standing'} · ${action?.visibleShoulders ?? 0}/2 shoulders · ${action?.quality ?? 'waiting-for-pose'} · Input age: ${lastPoseAt ? Math.round(performance.now() - lastPoseAt) + ' ms' : 'waiting'}` : 'Camera off';
  let phase = 'YOU ARE THE PLAYER', cue = 'Jump over the cacti.';
  let detail = message || (simulated ? 'Space or ↑ to jump. P to pause. No camera needed.' : 'Keep both shoulders visible. Your waist and feet can stay outside the frame.');
  let button = simulated ? 'Play' : 'Enable camera', disabled = false;
  if (error) { phase = 'CAMERA NEEDS ATTENTION'; cue = 'Let’s get you connected.'; detail = error; button = 'Retry camera'; }
  else if (runner.status === 'over') {
    phase = 'ROUND COMPLETE'; cue = 'Catch your breath. Go again.';
    detail = `${runner.score} points · ${runner.passed} cacti cleared.${simulated ? ' Space to play again.' : ' Camera is off.'}`; button = 'Play again';
  } else if (running) {
    const approaching = runner.obstacles.some(o => o.x > 70 && o.x - 116 < runner.speed * .8);
    phase = `${simulated ? 'KEYBOARD PREVIEW' : 'LIVE'} · ${runner.passed} CLEARED`;
    cue = approaching ? 'Jump!' : performance.now() - clearedAt < 1200 ? 'Cleared!' : 'Keep going!';
    detail = ''; button = 'Pause';
  } else if (simulated && runner.status === 'paused') {
    phase = 'PAUSED'; cue = 'Ready to step back in?'; button = 'Resume run';
  } else if (camera.active) {
    phase = 'CONNECTING TO PLAY'; disabled = true; button = 'Getting ready…';
    if (cameraState === 'requesting') { cue = 'Allow camera access.'; detail = 'Your video stays on this device.'; }
    else if (cameraState === 'loading') { cue = 'Loading local tracking…'; detail = 'Keep the camera fixed and leave space above your head.'; }
    else if (lastPoseAt && performance.now() - lastPoseAt >= 250) {
      phase = 'WAITING FOR TRACKING'; cue = 'Tracking is catching up.'; detail = 'Waiting for a fresh camera result before continuing the run.';
    } else if (action?.phase === 'missing') {
      cue = action.cue === 'return-to-starting-height' ? 'Return to your starting height.' : 'Keep both shoulders in view.';
      detail = action.cue === 'face-the-camera' ? 'Face the camera so both shoulders can be seen.' : 'Your waist and feet do not need to be visible.';
    } else if (!action || action.stage === 'standing') {
      phase = 'FINDING YOUR POSITION'; cue = 'Stand comfortably for a moment.';
      detail = 'Keep both shoulders visible. Then raise both hands for one second and lower them to start.'; button = 'Finding your position…';
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
  $('height').textContent = simulated || camera.active ? `${Math.round(fraction * 100)}%` : '—';
  $('best-height').textContent = `BEST LIFT ${Math.round(bestLift * 100)}%`;
  $('height-label').textContent = simulated || action?.calibrated ? 'LIFT' : 'FINDING POSITION';
  $('jump-range-value').textContent = `${$('jump-range').value}%`;
}

$('control-mode').addEventListener('change', () => {
  inputMode = $('control-mode').value;
  if (camera.active) camera.stop('input-changed');
  runner.setControlMode('motion'); previousStatus = 'ready';
  action = null; pose = null; cameraState = 'off'; awaiting = false; lastPoseAt = 0;
  bestLift = 0; lastPassed = 0; clearedAt = -Infinity; message = ''; error = ''; paint();
});
$('primary').addEventListener('click', start); $('jump').addEventListener('click', jump);
$('jump-range').addEventListener('input', paint);
$('stop').addEventListener('click', () => { pause('Camera is off. Enable the camera again when ready.', true); paint(); });
$('recalibrate').addEventListener('click', () => {
  pause(''); recognizer.recalibrate(); bestLift = 0; action = null; awaiting = true; paint();
});
$('debug').addEventListener('change', () => { $('skeleton').hidden = !$('debug').checked; drawSkeleton($('skeleton'), pose); });
window.addEventListener('blur', () => {
  if (runner.status === 'running' || camera.active) pause('Window focus changed. Resume when ready.', true);
});
window.addEventListener('pagehide', () => { pause('Page closed.', true); });
window.addEventListener('keydown', event => {
  if (event.target.closest('button,input,a,textarea,select') || event.repeat) return;
  if (inputMode === 'keyboard' && ['Space','ArrowUp'].includes(event.code)) { event.preventDefault(); jump(); }
  else if (event.code === 'KeyP' || event.code === 'Escape') {
    event.preventDefault();
    if (runner.status === 'running' || camera.active) pause('Paused. Resume when ready.', true);
    else if (inputMode === 'keyboard' && runner.status === 'paused' && event.code === 'KeyP') start();
  }
});
// Compact observability: no raw camera frames or identifiable landmarks.
window.dinoAR = Object.freeze({ subscribeTracking: trackingPublisher.subscribe, getState: () => ({ ...runner.snapshot(), inputMode,
  sessionId: presentationSession.sessionId, source: presentationSession.source,
  input: { source: action?.source ?? null, phase: action?.phase ?? null,
    heightRatio: action?.heightRatio ?? 0, bestHeightRatio: bestLift },
  camera: { state: cameraState, stage: inputMode === 'camera' ? action?.stage ?? 'standing' : 'off',
    calibrated: inputMode === 'camera' && (action?.calibrated ?? false),
    bestHeightRatio: bestLift, trackingMode: action?.trackingMode ?? null, heightRatio: action?.heightRatio ?? 0, cue: action?.cue ?? null,
    quality: action?.quality ?? null, frameAgeMs: lastPoseAt ? Math.round(performance.now() - lastPoseAt) : null },
  debug: $('debug').checked,
  playfield: (() => {
    const {width,height} = $('world').getBoundingClientRect(), g = sceneGeometry(width,height);
    return { width, height, groundY: g.origin.y, player: g.player(runner.y), obstacles: runner.obstacles.map(o => g.obstacle(o)) };
  })(),
  nextObstacleDistance: runner.obstacles[0] ? runner.obstacles[0].x - 116 : null,
}) });

function frame(now) {
  const dt = lastFrame ? (now - lastFrame) / 1000 : 0, fresh = lastPoseAt && now - lastPoseAt < 250;
  if (inputMode === 'camera' && camera.running && runner.status === 'running' && !fresh) pause('Tracking is delayed. Stand steady, then resume.');
  if (runner.status === 'running') {
    if (inputMode === 'keyboard') consumeAction(keyboard.update(now,dt));
    runner.step(dt);
  }
  drawWorld($('world'),runner,$('debug').checked);
  drawSkeleton($('skeleton'),inputMode === 'camera' && fresh ? pose : null);
  if (now - lastPaint > 50) { paint(); lastPaint = now; }
  lastFrame = now; requestAnimationFrame(frame);
}
paint(); requestAnimationFrame(frame);

mountGameEntry({root:$('arena'),title:'Dino AR',description:'Lift your body to help Dino jump through your room.',buttons:[$('primary')],options:[$('control-mode')]});
