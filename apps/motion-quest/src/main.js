import './style.css';
import { SquatRecognizer } from '@fitness-pair/action-squat';
import { fromMediaPipe } from '@fitness-pair/pose-mediapipe';
import { createGameState, consumeAction } from '@fitness-pair/game-forest';
import { ARGame } from './ar-game.js';
import { cameraPoint } from './camera-projection.js';

const $ = id => document.getElementById(id);
const setText = (id, text) => { if ($(id).textContent !== text) $(id).textContent = text; };
const video = $('camera'), overlay = $('skeleton'), ctx = overlay.getContext('2d');
const game = new ARGame($('game'));
const detector = new SquatRecognizer();
const links = [['leftShoulder','rightShoulder'],['leftShoulder','leftElbow'],['leftElbow','leftWrist'],['rightShoulder','rightElbow'],['rightElbow','rightWrist'],['leftShoulder','leftHip'],['rightShoulder','rightHip'],['leftHip','rightHip'],['leftHip','leftKnee'],['leftKnee','leftAnkle'],['rightHip','rightKnee'],['rightKnee','rightAnkle']];
let mode = 'idle', stream = null, worker = null, generation = 0, inFlight = false;
let frameSentAt = 0, lastVideoTime = -1, lastResultAt = 0, lastRenderAt = 0, raf = 0;
let reps = 0, elapsedMs = 0, runningAt = null, demoHeldAt = null, demoCharge = 0;
let statusUntil = 0, currentProgress = 0, sound = null;
let initTimer = null, gameState = null, inputSeq = 0;

function status(title, detail, error = false, headline = title) {
  setText('status-title', title); setText('status-detail', detail);
  document.querySelector('.tracking-panel').classList.toggle('error', error);
  setText('arena-title', headline);
  setText('arena-kicker', mode === 'demo' ? 'Preview · simulated movement' : 'Your next move');
  document.querySelector('.arena-message').classList.toggle('error', error);
}
function progress(value, label = 'Movement charge') {
  currentProgress = Math.max(0, Math.min(1, value));
  $('charge-bar').style.width = `${currentProgress * 100}%`;
  $('charge-value').textContent = `${Math.round(currentProgress * 100)}%`;
  $('charge-label').textContent = label;
  $('arena-subtitle').textContent = (mode === 'camera' || mode === 'demo') && reps < 5
    ? `${label === 'Standing calibration' ? 'Calibrating' : 'Charge'} ${Math.round(currentProgress * 100)}% · ${reps} / 5 hits`
    : `${reps} / 5 hits`;
}
function pauseClock() { if (runningAt !== null) elapsedMs += performance.now() - runningAt; runningAt = null; }
function startClock() { if (runningAt === null && reps < 5) runningAt = performance.now(); }
function resetRound() {
  reps = 0; elapsedMs = 0; runningAt = null; demoHeldAt = null; demoCharge = 0;
  const sessionId = crypto.randomUUID();
  const source = { kind: mode === 'demo' ? 'synthetic' : 'camera', id: sessionId };
  gameState = createGameState({ sessionId, source }); inputSeq = 0;
  statusUntil = 0; detector.reset({ sessionId, source }); game.reset(); progress(0);
  $('rep-count').textContent = '0'; $('damage-count').textContent = '0'; $('elapsed').textContent = '00:00';
  $('hp-label').textContent = '100 / 100'; $('hp-bar').style.width = '100%'; $('victory').hidden = true;
}
function beep() {
  if (!sound || sound.state !== 'running') return;
  const oscillator = sound.createOscillator(), gain = sound.createGain();
  oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(300, sound.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(780, sound.currentTime + .15);
  gain.gain.setValueAtTime(.035, sound.currentTime); gain.gain.exponentialRampToValueAtTime(.001, sound.currentTime + .23);
  oscillator.connect(gain); gain.connect(sound.destination); oscillator.start(); oscillator.stop(sound.currentTime + .24);
}
function enableSound() {
  try { sound ??= new AudioContext(); sound.resume().catch(() => {}); } catch { /* Sound is optional. */ }
}
function attack(actionFrame) {
  if (reps >= 5) return;
  const result = consumeAction(gameState, actionFrame); gameState = result.state;
  if (!result.attack) return;
  startClock(); reps = gameState.completedReps;
  const hp = gameState.health; game.attack(hp); beep();
  $('rep-count').textContent = String(reps); $('damage-count').textContent = String(reps * 20);
  $('hp-label').textContent = `${hp} / 100`; $('hp-bar').style.width = `${hp}%`;
  progress(0);
  statusUntil = performance.now() + 1000;
  status(mode === 'demo' ? 'Simulated attack landed!' : 'Squat +1. Attack landed!', reps < 5 ? 'Stand steady, then continue at your own pace.' : 'Quest complete. Take a breather.', false, reps < 5 ? `Hit! ${reps} / 5` : 'Quest complete!');
  if (reps === 5) {
    pauseClock(); game.charge = 0;
    const wasDemo = mode === 'demo';
    $('victory-copy').textContent = wasDemo ? 'Preview complete! Enable your camera to play with real movement.' : 'Five squats. Five hits. Nicely done!';
    // Close camera + worker immediately after the last repetition.
    releaseCamera();
    $('tracking-badge').textContent = wasDemo ? 'Preview complete' : 'Complete · camera off';
    $('camera-tag').textContent = 'CAM 01 · OFF';
    $('start').hidden = false; $('start').disabled = false;
    $('start').innerHTML = 'Enable camera & retry <span>↗</span>';
    $('stop').hidden = true; $('calibrate').hidden = true; $('demo-action').hidden = true;
    const roundGeneration = generation;
    setTimeout(() => { if (reps === 5 && generation === roundGeneration) $('victory').hidden = false; }, 850);
  }
}
function releaseCamera() {
  generation++;
  clearTimeout(initTimer); initTimer = null;
  worker?.terminate(); worker = null; inFlight = false;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.srcObject = null; game.body = null; ctx.clearRect(0, 0, overlay.width, overlay.height);
  $('camera-placeholder').hidden = false; $('fps').textContent = '';
  game.charge = 0;
}
function stopCamera(message = 'Camera is off', detail = 'Enable your camera to start a new round.', headline = message) {
  releaseCamera(); mode = 'idle'; pauseClock(); demoHeldAt = null; demoCharge = 0; progress(0);
  $('start').hidden = false; $('start').disabled = false; $('start').innerHTML = 'Enable camera & play <span>↗</span>';
  $('stop').hidden = true; $('calibrate').hidden = true; $('demo-action').hidden = true;
  $('demo-action').classList.remove('pressed'); $('demo').hidden = false;
  $('tracking-badge').textContent = 'Camera is off'; $('camera-tag').textContent = 'CAM 01 · OFF'; $('mode-label').textContent = 'Waiting for an adventurer';
  status(message, detail, false, headline);
}
function failCamera(error) {
  console.error('Motion Quest camera/model error:', error.name, error.message);
  const messages = {
    NotAllowedError: ['Camera permission denied', 'Allow camera access in your browser and retry, or try the preview.', 'Camera blocked'],
    NotFoundError: ['No camera found', 'Connect a camera and retry, or try the preview.'],
    NotReadableError: ['Camera is unavailable', 'Another app may be using it. Close that app and retry.'],
    TimeoutError: ['Model loading timed out', 'Retry after the local model files have been prepared.'],
  };
  const [title, detail, headline = 'Retry camera'] = messages[error.name] ?? ['Could not start recognition', 'Try a recent Chrome or Edge browser, or use the gameplay preview.'];
  stopCamera(title, detail, headline); status(title, detail, true, headline);
}
async function startCamera() {
  stopCamera(); mode = 'loading'; resetRound(); enableSound();
  const session = generation;
  $('start').disabled = true; $('start').textContent = 'Requesting camera…'; $('stop').hidden = false;
  status('Please allow camera access', 'The pose model will then load on this device.', false, 'Allow camera');
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    failCamera(new Error('Camera requires localhost or HTTPS')); status('A secure page is required', 'Open this page using localhost or HTTPS.', true); return;
  }
  try {
    const nextStream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } });
    if (session !== generation) { nextStream.getTracks().forEach(track => track.stop()); return; }
    stream = nextStream;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (session === generation) stopCamera('Camera disconnected', 'Reconnect the camera, then enable it again.');
    });
    video.srcObject = stream; await video.play();
    if (session !== generation) return;
    $('camera-placeholder').hidden = true; $('start').textContent = 'Loading local model…';
    $('camera-tag').textContent = 'CAM 01 · LOCAL'; status('Warming up movement tracking', 'The model runs on this device. Stand tall for about 2 seconds when ready.', false, 'Getting ready');
    const workerURL = new URL(`${import.meta.env.BASE_URL}runtime/pose-worker.js`, location.href);
    worker = new Worker(workerURL);
    initTimer = setTimeout(() => {
      if (session === generation) failCamera(Object.assign(new Error('Model timed out'), { name: 'TimeoutError' }));
    }, 30_000);
    worker.onmessage = ({ data }) => {
      if (session !== generation) return;
      if (data.type === 'ready') {
        clearTimeout(initTimer); mode = 'camera'; lastVideoTime = -1; lastResultAt = performance.now();
        $('start').hidden = true; $('start').disabled = false; $('calibrate').hidden = false;
        $('tracking-badge').textContent = 'Local model ready'; $('mode-label').textContent = 'Camera AR · squat controls';
        status('Stand tall to calibrate', 'Keep shoulders to ankles visible for about 2 seconds. Turn slightly sideways.', false, 'Stand tall');
      } else if (data.type === 'pose') {
        inFlight = false; lastResultAt = performance.now();
        $('fps').textContent = `${Math.round(data.inferenceMs)} ms / frame`;
        try {
          const frame = fromMediaPipe({ landmarks: data.landmarks, sessionId: gameState.sessionId, seq: inputSeq++,
            tMs: data.time, source: gameState.source, width: video.videoWidth, height: video.videoHeight });
          drawSkeleton(frame.joints);
          game.setPose(frame.joints, video.videoWidth, video.videoHeight);
          const action = detector.update(frame);
          if (action) handlePose(action);
        } catch (error) { failCamera(error); }
      } else if (data.type === 'error') failCamera(new Error(data.message));
    };
    worker.onerror = () => { if (session === generation) failCamera(new Error('Worker failed')); };
    worker.postMessage({ type: 'init', base: new URL(import.meta.env.BASE_URL, location.href).href });
  } catch (error) { if (session === generation) failCamera(error); }
}
function handlePose(result) {
  if (mode !== 'camera' || reps >= 5) return;
  const copy = {
    missing: ['Your full movement is not visible', 'Keep shoulders to ankles in frame and stand steady before continuing.', false, 'Step into view'],
    stand: ['Stand tall first', 'Stand comfortably with straight legs, turned slightly sideways.', false, 'Stand tall'],
    calibrating: ['Calibrating your standing pose', 'Stay upright for about 2 seconds.', false, 'Hold still'],
    ready: ['Ready. Try a squat', 'Lower slowly and watch the magic gather around you.', false, 'Squat down'],
    lowering: ['Keep lowering to charge', 'Stay within a comfortable range. Turn slightly sideways if charge stays low.', false, 'Keep lowering'],
    down: ['Charged! Stand to attack', 'Return to standing to release your magic.', false, 'Stand to attack'],
  };
  const inactive = ['missing', 'calibrating'].includes(result.phase);
  if (inactive) { pauseClock(); statusUntil = 0; }
  else startClock();
  game.charge = inactive ? 0 : result.progress;
  progress(result.calibrationProgress ?? result.progress, result.phase === 'calibrating' ? 'Standing calibration' : 'Movement charge');
  if (result.completion) { attack(result); return; }
  gameState = consumeAction(gameState, result).state;
  if (performance.now() >= statusUntil && copy[result.cue]) status(...copy[result.cue]);
  $('tracking-badge').textContent = result.phase === 'missing' ? 'Waiting for full body' : result.phase === 'calibrating' ? 'Calibrating' : 'Body landmarks detected';
}
function drawSkeleton(points) {
  const w = video.videoWidth || 640, h = video.videoHeight || 480;
  // Match the full-screen, centered object-fit: cover camera, including its crop.
  const box = overlay.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (overlay.width !== Math.round(box.width * dpr) || overlay.height !== Math.round(box.height * dpr)) {
    overlay.width = Math.round(box.width * dpr); overlay.height = Math.round(box.height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, box.width, box.height);
  const x = p => cameraPoint(p, box.width, box.height, w, h).x;
  const y = p => cameraPoint(p, box.width, box.height, w, h).y;
  ctx.strokeStyle = '#d2ff8c'; ctx.lineWidth = 2; ctx.fillStyle = '#ecffd0';
  const visible = p => p && p.confidence !== null && p.confidence >= .6;
  for (const [a, b] of links) if (visible(points[a]) && visible(points[b])) {
    ctx.beginPath(); ctx.moveTo(x(points[a]), y(points[a])); ctx.lineTo(x(points[b]), y(points[b])); ctx.stroke();
  }
  for (const p of Object.values(points)) if (visible(p)) { ctx.beginPath(); ctx.arc(x(p), y(p), 3, 0, Math.PI * 2); ctx.fill(); }
}
async function sendFrame(time) {
  if (mode !== 'camera' || !worker || inFlight || reps >= 5 || video.readyState < 2 ||
      video.currentTime === lastVideoTime || time - frameSentAt < 60) return;
  const session = generation; inFlight = true; lastVideoTime = video.currentTime; frameSentAt = time;
  try {
    const bitmap = await createImageBitmap(video);
    if (session !== generation || !worker) { bitmap.close(); return; }
    worker.postMessage({ type: 'frame', bitmap, time }, [bitmap]);
  } catch (error) { if (session === generation) failCamera(error); }
}
function beginDemo() {
  stopCamera(); mode = 'demo'; resetRound(); enableSound();
  $('mode-label').textContent = 'Preview · simulated movement'; $('tracking-badge').textContent = 'Preview · no camera';
  $('demo-action').hidden = false; $('demo').hidden = true;
  $('camera-placeholder').hidden = true;
  status('Get a feel for the game', 'Hold the button or Space to charge, then release. This is a simulation.', false, 'Hold to charge');
}
function holdDemo() {
  if (mode !== 'demo' || reps >= 5 || demoHeldAt !== null) return;
  statusUntil = 0; status('Charging a simulated attack', 'Release once fully charged. This is a simulation.', false, 'Keep holding');
  demoHeldAt = performance.now(); $('demo-action').classList.add('pressed'); startClock();
}
function releaseDemo(cancel = false) {
  if (demoHeldAt === null) return;
  if (!cancel && mode === 'demo' && demoCharge >= 1) {
    const repIndex = reps + 1;
    attack({ version: 1, sessionId: gameState.sessionId, source: gameState.source, inputSeq: inputSeq++,
      tMs: performance.now(), recognizerId: 'button-preview/1', action: 'squat', phase: 'completed',
      cue: 'rep', progress: 0, calibrationProgress: null,
      completion: { id: `${gameState.sessionId}:preview:${repIndex}`, repIndex } });
  }
  demoHeldAt = null; demoCharge = 0; game.charge = 0; progress(0); $('demo-action').classList.remove('pressed');
}
function render(time) {
  if (document.hidden) { raf = 0; return; }
  if (time - lastRenderAt >= 32) {
    lastRenderAt = time;
    if (demoHeldAt !== null) {
      demoCharge = Math.min(1, (time - demoHeldAt) / 650); game.charge = demoCharge; progress(demoCharge);
      if (demoCharge >= 1) status('Preview charged', 'Release the button or Space to attack.', false, 'Release to attack');
    } else if (mode === 'demo' && reps < 5 && time >= statusUntil) {
      status('Get a feel for the game', 'Hold the button or Space to charge, then release. This is a simulation.', false, 'Hold to charge');
    }
    game.draw(time);
    const seconds = Math.floor((elapsedMs + (runningAt === null ? 0 : time - runningAt)) / 1000);
    $('elapsed').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (mode === 'camera' && reps < 5) {
      if (time - lastResultAt > 8000) failCamera(new Error('Inference stalled'));
      else void sendFrame(time);
    }
  }
  raf = requestAnimationFrame(render);
}
$('start').addEventListener('click', startCamera);
$('stop').addEventListener('click', () => stopCamera());
$('demo').addEventListener('click', beginDemo);
$('calibrate').addEventListener('click', () => {
  detector.recalibrate(); game.charge = 0; progress(0); pauseClock(); statusUntil = 0;
  status('Recalibrate your stance', 'Stand tall for about 2 seconds, then continue this round.', false, 'Stand tall');
});
$('again').addEventListener('click', () => mode === 'demo' ? beginDemo() : startCamera());
$('demo-action').addEventListener('pointerdown', event => { event.preventDefault(); $('demo-action').setPointerCapture(event.pointerId); holdDemo(); });
$('demo-action').addEventListener('pointerup', () => releaseDemo());
$('demo-action').addEventListener('pointercancel', () => releaseDemo(true));
window.addEventListener('keydown', event => {
  if (event.code === 'Space' && mode === 'demo' && (event.target === document.body || event.target === $('demo-action'))) {
    event.preventDefault(); if (!event.repeat) holdDemo();
  }
});
window.addEventListener('keyup', event => { if (event.code === 'Space' && demoHeldAt !== null) { event.preventDefault(); releaseDemo(); } });
window.addEventListener('blur', () => releaseDemo(true));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (mode === 'camera' || mode === 'loading') stopCamera('Paused · camera off', 'When you return, enable your camera to play again.');
    releaseDemo(true); pauseClock(); sound?.suspend().catch(() => {});
    cancelAnimationFrame(raf); raf = 0;
  } else if (!raf) raf = requestAnimationFrame(render);
});
window.addEventListener('pagehide', () => { releaseCamera(); sound?.close().catch(() => {}); });
raf = requestAnimationFrame(render);
