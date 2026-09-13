import './style.css';
import {createHandsStart} from '../../../packages/gameplay/hands-start-view.js';
import { DinoAudio } from './audio.js';
import { AnimatedRunner } from './animated-runner.js';
import { drawWorld, sceneGeometry } from '../../../experiments/gameplay/dino-ar/src/scene.js';
import { drawBody } from './body-overlay.js';
import { PoseCamera } from '../../dino-run/src/camera.js';
import { BodyGestures } from '../../dino-run/src/gestures.js';
import { setupFullscreen } from '../../dino-run/src/fullscreen.js';
import { JumpHeightRecognizer } from '@fitness-pair/action-jump-height';
import { createDiagnostics } from './diagnostics.js';

const $ = id => document.getElementById(id);
const gameMode = new URLSearchParams(location.search).get('mode') !== 'detect';
const sound = new DinoAudio(cue => log('audio-cue', { cue }));
const runner = new AnimatedRunner({ onEvent: (event, detail) => {
  log(event, detail);
  if (event === 'dino-jump-triggered') sound.effect('jump', detail.delayMs / 1000);
  if (event === 'dino-jump-landed') sound.effect('land');
} }); runner.setControlMode('motion');
let pauseReason = null, lastGameFrame = 0, lastPassed = 0, clearedAt = -Infinity;
$('setup').classList.toggle('game-mode', gameMode);
$('movement-settings').hidden = gameMode;
$('show-settings').hidden = !gameMode;
$('sound-setting').hidden = !gameMode;
$('mode-link').textContent = gameMode ? 'Jump detection only' : 'Play Dino';
$('mode-link').href = gameMode ? '?mode=detect' : './';
// Comfortable automatic scale relative to the standing torso; no maximum jump needed.
const MOVEMENT_SCALE = .15;
const recognizer = new JumpHeightRecognizer({ manualMaximum: true, preferUpperBody: true, robustTracking: true });
recognizer.setJumpRange(MOVEMENT_SCALE);
let bodyFrame = null, gameTrackingSince = null;
const GAME_TRACKING_GRACE_MS = 450;
const gestures = new BodyGestures();
const diagnostics = createDiagnostics();
const startGate = createHandsStart(document.querySelector('#setup'));
let countdownSerial = 0;
let cameraState = 'off', action = null, hands = null, lastPoseAt = 0, countdownAt = null;
let trackingHoldAt = null, signalState = null, candidateKey = '', candidateSince = 0;
let testing = false, jumpCount = 0, jumpPeak = 0, returning = false, detectedAt = null, lastJumpPeak = 0;
const countedJumps = new Set();
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
  video: $('camera'), inferenceTimeoutMs: gameMode ? 8000 : 1000,
  onStatus(status) {
    cameraState = status.state; log('camera-state', { state: cameraState });
    if (cameraState === 'requesting') {
      if (gameMode) runner.bindMotionSession(status);
      startGate.reset(status); recognizer.reset(status); recognizer.setJumpRange(MOVEMENT_SCALE); gestures.reset(status); action = null; hands = null;
      lastPoseAt = 0; countdownAt = null; previousStage = null; trackingHoldAt = null; signalState = null;
    }
    paint();
  },
  onPose(input) {
    lastPoseAt = input.tMs;
    const stale = performance.now() - input.tMs >= 250;
    const frame = stale ? { ...input, joints: {} } : visibleFrame(input);
    bodyFrame = stale ? null : frame;
    const next = recognizer.update(frame);
    if (!next) return;
    action = next; hands = gestures.update(frame);
    if (startGate.update(frame, action.calibrated || action.canConfirmMaximum) && !action.calibrated) confirm('both-hands-start');
    if (gameMode && testing) {
      // A new camera/resolution can need a fresh baseline, without a new round,
      // confirmation gesture or countdown. Ordinary dropouts retain calibration.
      if (!action.calibrated && action.canConfirmMaximum && recognizer.confirmMaximum()) {
        log('game-baseline-recovered');
      }
      updateGameTracking(performance.now());
    }
    observeJump(input);
    if (gameMode && testing && runner.status === 'running') runner.applyMotion(action);
    const signal = stale ? 'stale-frame' : action.quality;
    if (signal !== signalState) {
      if (signal === 'tracking-grace' || signalState === 'tracking-grace'
        || action.phase === 'missing') log('tracking-signal', { from: signalState, to: signal, reason: action.trackingReason ?? null,
          rejectedForMs: recognizer.rejectedSince === null ? 0 : input.tMs - recognizer.rejectedSince,
          inputSeq: input.seq });
      signalState = signal;
    }
    if (action.stage !== previousStage) {
      log('calibration-stage', { from: previousStage, to: action.stage, quality: action.quality });
      previousStage = action.stage;
    }
    if (hands?.event) {
      log('gesture', { kind: hands.event.kind, inputSeq: input.seq });
      if (gameMode && testing && pauseReason !== 'tracking' && hands.event.kind === 'both-hands') toggleGame('gesture');
      if (hands.event.kind === 'one-hand' && !action.calibrated && !(gameMode && testing)) confirm('gesture');
    }
    paint();
  },
  onStop({ reason }) {
    startGate.hide();
    bodyFrame = null; drawBody($('body-overlay'), null);
    if (gameMode) pauseGame('camera-stopped');
    testing = false;
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
  if (gameMode) sound.activate();
  const resumeRound = gameMode && !complete && runner.status === 'paused';
  if (!resumeRound) {
    jumpCount = 0; countedJumps.clear(); lastJumpPeak = 0;
    runner.setControlMode('motion'); lastPassed = 0; clearedAt = -Infinity;
  }
  complete = false; error = ''; countdownAt = null;
  testing = resumeRound; gameTrackingSince = null;
  recognizer.retainCalibration = resumeRound;
  if (resumeRound) pauseReason = 'tracking';
  jumpPeak = 0; returning = false; detectedAt = null;
  log('setup-start-requested', { resumeRound }); void camera.start();
}
function pauseGame(reason) {
  if (!gameMode || !runner.command('pause')) return;
  pauseReason = reason;
  if (reason !== 'tracking') { jumpPeak = 0; returning = false; }
  log('game-paused', { reason, score: runner.score });
}
function updateGameTracking(now) {
  if (!gameMode || !testing) return;
  const valid = camera.running && lastPoseAt && now - lastPoseAt < 250
    && action?.calibrated && action.phase !== 'missing';
  if (!valid) {
    if (gameTrackingSince === null) {
      gameTrackingSince = now;
      log('game-tracking-gap', { reason: !lastPoseAt || now - lastPoseAt >= 250 ? 'stale-frame' : action?.quality, roundId: runner.roundId });
    }
    if (now - gameTrackingSince >= GAME_TRACKING_GRACE_MS) pauseGame('tracking');
    return;
  }
  if (runner.status === 'paused' && pauseReason === 'tracking'
    && (!['ready', 'completed'].includes(action.phase) || action.heightRatio >= .03 || action.cue === 'prepare-jump')) return;
  if (gameTrackingSince !== null) {
    log('game-tracking-recovered', { durationMs: Math.round(now - gameTrackingSince) });
    gameTrackingSince = null;
  }
  if (runner.status === 'paused' && pauseReason === 'tracking') {
    runner.command('resume'); pauseReason = null;
    log('game-resumed', { via: 'tracking-recovered', score: runner.score });
  }
}
function toggleGame(via) {
  if (runner.status === 'running') pauseGame('manual');
  else if (runner.status === 'paused') {
    const fresh = lastPoseAt && performance.now() - lastPoseAt < 250;
    if (!fresh || !action?.calibrated || !['ready', 'completed'].includes(action.phase)
      || action.cue === 'prepare-jump' || action.heightRatio >= .03) {
      log('game-resume-blocked', { via, reason: 'stand-steady' }); return;
    }
    runner.command('resume'); pauseReason = null;
    runner.applyMotion({ ...action, completion: null });
    log('game-resumed', { via });
  }
  paint();
}
function gamePresentation(now) {
  const base = { stage: 'playing', step: 'ready', button: runner.status === 'paused' ? 'Resume run' : 'Pause',
    feedback: 'Raise BOTH hands for 1 second to pause or resume. Lower them between commands.' };
  if (runner.status === 'paused' && pauseReason === 'tracking') return { ...base,
    stage: 'recovering', status: 'TRACKING RECOVERING', title: 'Stand in your starting spot.',
    detail: 'Your run is saved. Tracking will resume automatically.',
    feedback: 'Keep your shoulders and hips visible. No setup or hand gesture needed.',
    button: undefined, reason: 'tracking-recovery' };
  if (runner.status === 'paused') return { ...base, status: 'GAME PAUSED', title: 'Ready to continue?',
    detail: 'Stand upright, then click Resume or raise both hands.', reason: 'manual-pause' };
  const approaching = runner.obstacles.some(o => o.x > 70 && o.x - 116 < runner.speed * .70);
  const confirmed = detectedAt !== null && now - detectedAt < 1800;
  return { ...base, status: 'RUNNING',
    title: approaching ? 'Jump!' : now - clearedAt < 1200 ? 'Cleared!' : confirmed ? 'Jump detected!' : 'Keep going!',
    detail: approaching ? 'Lift your dinosaur over the cactus.' : confirmed ? `Jump ${jumpCount} confirmed.` : 'Your jump triggers a smooth dinosaur jump.',
    reason: approaching ? 'obstacle-approaching' : confirmed ? 'jump-detected' : 'running' };
}
function observeJump(input) {
  if (!testing) return;
  if (!action.calibrated) {
    if (!gameMode) {
      testing = false; log('jump-test-paused', { reason: 'baseline-lost', count: jumpCount });
    }
    jumpPeak = 0; returning = false; detectedAt = null;
    return;
  }
  if (action.phase === 'missing' || gameMode && runner.status !== 'running') return;
  if (action.completion && !countedJumps.has(action.completion.id)) {
    countedJumps.add(action.completion.id); jumpCount++;
    detectedAt = performance.now(); lastJumpPeak = Math.round(jumpPeak * 100);
    log('jump-detected', { id: action.completion.id, count: jumpCount,
      peakPercent: lastJumpPeak, inputSeq: input.seq, inputTMs: input.tMs });
    jumpPeak = 0; returning = false;
  } else if (action.phase === 'active') {
    if (jumpPeak === 0 && action.heightRatio > 0) log('jump-started', { inputSeq: input.seq });
    jumpPeak = Math.max(jumpPeak, action.heightRatio);
    if (!returning && jumpPeak - action.heightRatio > .04) {
      returning = true; log('jump-returning', { inputSeq: input.seq });
    }
  } else if (jumpPeak > 0) {
    log('jump-cancelled', { reason: 'no-confirmed-return', inputSeq: input.seq });
    jumpPeak = 0; returning = false;
  }
}
function finish(reason = 'user-finish') {
  setSettingsOpen(false);
  log(gameMode ? 'round-finished' : 'jump-test-finished', { reason, count: jumpCount, score: runner.score, cleared: runner.passed });
  complete = true;
  if (gameMode) runner.command('pause');
  camera.stop('round-complete'); paint();
}
function jumpPresentation(now) {
  const base = { stage: 'testing', step: 'ready', button: 'Finish test',
    feedback: 'Skeleton stays live. Half-body tracking uses torso rise and return.' };
  if (action.phase === 'active') return { ...base, status: returning ? 'JUMP · RETURNING' : 'JUMP · RISING',
    title: returning ? 'Coming back down.' : 'Moving up!',
    detail: 'Return to your starting height to confirm this jump.', reason: returning ? 'jump-returning' : 'jump-rising' };
  if (detectedAt !== null && now - detectedAt < 1800) return { ...base,
    status: `JUMP ${jumpCount} · CONFIRMED`, title: 'Jump detected!',
    detail: `Peak response ${lastJumpPeak}%. You can try another jump.`, reason: 'jump-detected' };
  if (action.cue === 'prepare-jump') return { ...base, status: 'JUMP · PREPARATION',
    title: 'Ready when you are.', detail: 'A small crouch is OK. Rise above your standing height.', reason: 'prepare-jump' };
  return { ...base, status: `JUMP DETECTION · ${jumpCount} CONFIRMED`, title: 'Try a small jump.',
    detail: 'Rise, then return to your starting height.', reason: 'awaiting-jump' };
}
function confirm(via) {
  if (!lastPoseAt || performance.now() - lastPoseAt >= 250 || !recognizer.confirmMaximum()) {
    log('confirmation-rejected', { via, reason: !lastPoseAt || performance.now() - lastPoseAt >= 250 ? 'stale-tracking' : 'height-not-ready', stage: action?.stage ?? null, cue: action?.cue ?? null });
    return false;
  }
  log('height-confirmed', { via, rangeSource: 'automatic', torsoPercent: MOVEMENT_SCALE * 100 }); paint(); return true;
}
function presentation(now) {
  if (gameMode && complete) return { stage: 'complete', status: 'ROUND COMPLETE', title: 'Play again?', detail: `${runner.score} points · ${runner.passed} cacti cleared · ${jumpCount} jumps`, feedback: 'Camera is off. Your results are in the local log.', button: 'Play again', step: 'ready' };
  if (complete) return { stage: 'complete', status: 'JUMP TEST COMPLETE', title: `${jumpCount} jump${jumpCount === 1 ? '' : 's'} detected.`, detail: 'Your results are in the local log.', feedback: 'POC complete · camera is now off', button: 'Try again', step: 'ready' };
  if (error) return { stage: 'error', status: 'CAMERA NEEDS ATTENTION', title: 'Let’s try again.', detail: error, feedback: 'Your progress log is available below.', button: 'Retry camera' };
  if (gameMode && cameraState === 'off' && runner.status === 'paused') return { stage: 'paused', status: 'CAMERA PAUSED', title: 'Resume your run.', detail: 'Enable the camera and stand steady to continue.', feedback: `${runner.score} points saved.`, button: 'Resume with camera', step: 'ready' };
  if (cameraState === 'off') return { stage: 'off', status: 'LET’S GET YOU READY', title: 'Stand back.\nWe’ll guide you.', detail: 'One step at a time. Follow the big words.', feedback: window.self===window.top?'Camera stays on your device. No recording.':'Your game records on this device. Share only when you choose.', button: 'Enable camera' };
  if (cameraState === 'requesting') return { stage: 'loading', status: 'CAMERA PERMISSION', title: 'Allow your camera.', detail: 'Choose Allow in the browser prompt.', feedback: 'Then step back where you can see the screen.' };
  if (cameraState === 'loading') return { stage: 'loading', status: 'GETTING READY', title: 'One moment…', detail: 'Starting your camera tracking.', feedback: 'Keep your shoulders and hips in view.' };
  if (gameMode && testing) return gamePresentation(now);
  const unavailable = !lastPoseAt || now - lastPoseAt >= 250 || !action || action.phase === 'missing';
  if (unavailable) {
    if (trackingHoldAt === null) {
      trackingHoldAt = now;
      log('tracking-hold-started', { reason: now - lastPoseAt >= 250 ? 'stale-tracking' : action?.quality });
    }
    if (now - trackingHoldAt < 350 && ['standing', 'maximum', 'confirm', 'ready', 'countdown', 'testing', 'playing'].includes(view.stage)) {
      return { ...view, button: undefined, paused: true, reason: 'tracking-grace',
        feedback: 'Brief tracking interruption. Your progress is saved.' };
    }
  } else if (trackingHoldAt !== null) {
    const durationMs = Math.round(now - trackingHoldAt);
    if (countdownAt !== null) countdownAt += now - trackingHoldAt;
    log('tracking-hold-ended', { durationMs }); trackingHoldAt = null;
  }
  if (!lastPoseAt || now - lastPoseAt >= 250) return { stage: 'missing', status: 'WAITING FOR LIVE TRACKING', title: 'Tracking paused.', detail: 'Stay in view. We’re waiting for a fresh frame.', feedback: 'Nothing will start until tracking returns.', reason: 'stale-tracking' };
  if (!action || action.phase === 'missing') return { stage: 'missing', status: 'WE NEED TO SEE YOU', title: action?.quality === 'position-changed' ? 'Return to your spot.' : 'Step into view.', detail: 'Show both shoulders and hips. Face the camera.', feedback: 'Your legs can stay outside the picture.', reason: action?.quality ?? 'missing-body' };
  if (testing && action.calibrated) return gameMode ? gamePresentation(now) : jumpPresentation(now);
  if (action.stage === 'standing') return { stage: 'standing', status: 'STEP 1 OF 3 · FIND YOUR BASELINE', title: 'Stand tall.\nHold still.', detail: 'Stay where you are for two seconds.', feedback: action.quality === 'unstable-stance' ? 'Keep your shoulders and hips steady.' : 'We can see you. Keep holding…', progress: (action.calibrationProgress ?? 0) * 2, step: 'standing', reason: action.quality };
  if (action.cue === 'prepare-jump') return { stage: action.calibrated ? 'ready' : 'maximum', status: 'JUMP PREPARATION', title: 'Ready when you are.', detail: 'Try a small movement, or stand up to confirm.', feedback: 'Your standing baseline is saved.', step: action.calibrated ? 'ready' : 'maximum', reason: 'prepare-jump' };
  if (action.stage === 'maximum') {
    if (action.canConfirmMaximum) {
      const holding = hands?.kind === 'both-hands' && !hands.latched;
      return { stage: 'confirm', status: 'MOVEMENT READY', title: holding ? 'Keep your hand up.' : 'Raise BOTH hands.', detail: holding ? 'Hold it above your shoulder for one second.' : 'Hold both hands above your shoulders for one second.', feedback: !hands?.tracked ? 'Show both hands — or use the button.' : 'Your baseline is ready. No jump required.', progress: holding ? hands.progress : 0, button: 'Confirm & continue', step: 'confirm', reason: hands?.tracked ? 'awaiting-confirmation' : 'missing-hands' };
    }
    return { stage: 'maximum', status: 'STEP 2 OF 3 · GET READY', title: 'Stand steady.', detail: 'Return to your starting posture.', feedback: 'No jump required. Stand upright to confirm.', step: 'maximum', reason: action.cue };
  }
  if (!startGate.open) return {stage:'ready',status:'READY TO START',title:'Raise BOTH hands.',detail:'Hold above your shoulders for one second.',feedback:'Then lower both hands.',step:'ready'};
  const steady = action.calibrated && action.heightRatio < .03;
  if (!steady) return { stage: 'ready', status: 'MOVEMENT CONFIRMED', title: 'Stand steady.', detail: 'Return to your starting height to begin.', feedback: 'Your baseline is saved. Waiting for a steady pose.', step: 'ready', reason: 'not-grounded' };
  if (countdownAt === null) { countdownAt = now; countdownSerial++; log('countdown-started'); }
  const remaining = Math.max(1, Math.ceil((3000 - (now - countdownAt)) / 1000));
  return { stage: 'countdown', status: 'MOVEMENT CONFIRMED · GET READY', title: String(remaining), detail: 'Stand steady. You’re ready to go.', feedback: 'No extra hand gesture needed.', progress: (now - countdownAt) / 3000, step: 'ready' };
}
function paint() {
  const now = performance.now();
  let next = presentation(now);
  // Debounce competing jump/confirmation instructions, independently of action
  // recognition. An unready confirmation button is never kept actionable.
  const requestedKey = [next.stage, next.title].join('|');
  if (requestedKey !== candidateKey) { candidateKey = requestedKey; candidateSince = now; }
  if (!next.paused && action?.stage === 'maximum'
    && ['maximum', 'confirm'].includes(view.stage) && ['maximum', 'confirm'].includes(next.stage)
    && requestedKey !== [view.stage, view.title].join('|') && now - candidateSince < 180) {
    next = { ...view, button: undefined };
  }
  if (next.stage !== 'countdown' && countdownAt !== null) {
    log('countdown-interrupted', { reason: next.reason ?? next.stage }); countdownAt = null;
  }
  const key = [next.stage, next.title, next.reason].join('|');
  view = next;
  if (key !== lastViewKey) {
    lastViewKey = key; log('screen-state', { stage: next.stage, instruction: next.title, reason: next.reason ?? null });
    $('announcement').textContent = `${next.status}. ${next.title}. ${next.detail}`;
  }
  sound.update({ phase: !gameMode ? 'idle' : complete ? 'finished' : !camera.active ? 'idle'
    : next.stage === 'countdown' && !next.paused ? 'countdown'
    : testing && runner.status === 'running' ? 'running'
    : runner.status === 'paused' || next.paused ? 'paused' : 'setup',
    count: next.stage === 'countdown' ? Number(next.title) : null,
    countdownId: countdownSerial, passed: runner.passed, speed: runner.speed, crashed: runner.status === 'over' });
  const showGame = gameMode && runner.status !== 'ready';
  $('setup').classList.toggle('playing', showGame);
  $('game-world').hidden = !showGame;
  $('game-stats').hidden = !showGame;
  $('game-score').textContent = String(runner.score);
  $('game-cleared').textContent = String(runner.passed);
  $('end-run').hidden = !showGame || complete;
  $('jump-count').textContent = String(jumpCount);
  $('jump-results').hidden = !testing && jumpCount === 0 && !complete;
  const fresh = camera.running && bodyFrame && now - bodyFrame.tMs < 250 && action?.phase !== 'missing';
  const response = fresh ? Math.round((action?.previewHeightRatio ?? 0) * 100) : 0;
  $('movement-meter').value = response;
  $('movement-label').textContent = !camera.running ? 'Live movement · enable camera'
    : !fresh ? 'Live movement · tracking paused' : `${gameMode ? 'Body movement' : 'Live jump response'} · ${response}%`;
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
$('primary').addEventListener('click', () => { if (camera.running && testing) { if (gameMode) toggleGame('button'); else finish(); } else if (camera.running && action?.canConfirmMaximum) confirm('button'); else if (!camera.active) start(); });
$('end-run').addEventListener('click', () => finish());
function setSettingsOpen(open) {
  if (!gameMode) return;
  $('movement-settings').hidden = !open;
  $('show-settings').setAttribute('aria-expanded', String(open));
}
$('show-settings').addEventListener('click', () => setSettingsOpen($('movement-settings').hidden));
document.addEventListener('click', event => {
  if (!$('movement-settings').contains(event.target) && !$('show-settings').contains(event.target)) setSettingsOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && gameMode && !$('movement-settings').hidden) {
    setSettingsOpen(false); $('show-settings').focus();
  }
});
$('sound-enabled').addEventListener('change', () => {
  sound.setMuted(!$('sound-enabled').checked);
  log('sound-changed', { enabled: $('sound-enabled').checked });
});
document.addEventListener('visibilitychange', () => { if (document.hidden) sound.stop(); });
window.addEventListener('pagehide', () => sound.dispose());
$('show-body').addEventListener('change', () => {
  $('body-overlay').hidden = !$('show-body').checked;
  drawBody($('body-overlay'), null);
  log('body-overlay-changed', { enabled: $('show-body').checked });
});
$('stop').addEventListener('click', () => { complete = false; camera.stop('user-stop'); });
$('show-log').addEventListener('click', () => { $('diagnostics').hidden = !$('diagnostics').hidden; $('show-log').setAttribute('aria-expanded', String(!$('diagnostics').hidden)); paintLog(); });
$('close-log').addEventListener('click', () => { $('diagnostics').hidden = true; $('show-log').setAttribute('aria-expanded', 'false'); });
$('clear-log').addEventListener('click', () => { diagnostics.clear(); paintLog(); });
$('export-log').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([diagnostics.export()], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'camera-start-log.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.cameraSetup = Object.freeze({ getAudioStream:()=>sound.getAudioStream(), getState: () => ({ stage: view.stage, reason: view.reason ?? null, camera: cameraState, calibration: action?.stage ?? null, heightConfirmed: action?.calibrated ?? complete, canConfirm: action?.canConfirmMaximum ?? false, testing, jumpCount, audio: sound.snapshot(), mode: gameMode ? 'game' : 'detect',
  gesture: hands ? { kind: hands.kind, latched: hands.latched, progress: hands.progress, tracked: hands.tracked } : null,
  game: gameMode ? { ...runner.snapshot(), pauseReason, nextObstacleDistance: runner.obstacles[0] ? runner.obstacles[0].x - 116 : null,
    playfield: (() => { const {width,height} = $('game-world').getBoundingClientRect(); const g = sceneGeometry(width,height); return { width, height, groundY: g.origin.y, player: g.player(runner.y) }; })() } : null }), getLog: () => diagnostics.entries() });
function tick() {
  const now = performance.now(), dt = lastGameFrame ? (now - lastGameFrame) / 1000 : 0;
  lastGameFrame = now;
  updateGameTracking(now);
  if (gameMode && testing && runner.status === 'paused' && pauseReason === 'tracking') runner.settleJump(dt);
  if (gameMode && testing && runner.status === 'running') {
    runner.step(dt);
    if (runner.passed > lastPassed) { clearedAt = now; lastPassed = runner.passed; log('obstacle-cleared', { count: runner.passed, score: runner.score }); }
    if (runner.status === 'over') finish('collision');
  }
  if (!$('game-world').hidden) drawWorld($('game-world'), runner, $('show-body').checked);
  drawBody($('body-overlay'), camera.running && bodyFrame && performance.now() - bodyFrame.tMs < 250 ? bodyFrame : null);
  if (camera.running) {
    paint();
    if (trackingHoldAt === null && countdownAt !== null && performance.now() - countdownAt >= 3000) {
      countdownAt = null; testing = true; jumpPeak = 0; returning = false; detectedAt = null;
      log('setup-completed');
      if (gameMode) {
        recognizer.retainCalibration = true;
        const resuming = runner.status === 'paused';
        runner.command(resuming ? 'resume' : 'start'); pauseReason = null;
        runner.applyMotion({ ...action, completion: null });
        log(resuming ? 'game-resumed' : 'game-started', { via: 'setup', score: runner.score });
      } else log('jump-test-started', { count: jumpCount });
      paint();
    }
  }
  requestAnimationFrame(tick);
}
paint(); requestAnimationFrame(tick);
