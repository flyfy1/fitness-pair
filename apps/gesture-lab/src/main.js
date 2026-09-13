import './style.css';
import { GestureCamera } from './camera.js';
import { RATINGS } from './ratings.js';
import { GESTURES, GestureActions, consumeAction, initialState, findGesture } from './gestures.js';

const $ = id => document.getElementById(id);
const video = $('video'), overlay = $('overlay'), ctx = overlay.getContext('2d');
$('catalog').innerHTML = GESTURES.map(g => `<article data-gesture="${g.id}"><div class="card-top"><span class="emoji">${g.icon}</span><span class="badge">${g.experimental ? 'EXPERIMENTAL MOTION' : 'BUILT-IN POSE'}</span></div><h3>${g.name}</h3><p>${g.hint}</p><div class="mapping">${g.command ? `→ ${g.command}` : 'Recognition only'}</div></article>`).join('');
$('rating-catalog').innerHTML = RATINGS.map(g => `<article data-gesture="${g.id}"><span class="rating-number">${g.icon}</span><h3>${g.name}</h3><p>${g.hint}</p><div class="mapping">→ Rate ${g.rating}/5</div></article>`).join('');
let recognizer, state, lastAction = null;
const ratingMode = () => $('mode').value === 'ratings';

function draw(hands) {
  overlay.width = video.videoWidth || 640; overlay.height = video.videoHeight || 480;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  for (const hand of hands) for (const p of Object.values(hand.joints)) {
    ctx.beginPath(); ctx.arc(p.x * overlay.width, p.y * overlay.height, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#cbfb89'; ctx.fill();
  }
}

function resetLive() {
  $('camera-tag').textContent = 'CAMERA OFF'; $('placeholder').hidden = false;
  $('start').disabled = false; $('stop').disabled = true; $('hold').value = 0;
  $('gesture-icon').textContent = '—'; $('gesture-name').textContent = 'No hand detected';
  $('confidence').textContent = 'Model confidence —'; $('timing').textContent = 'Camera stopped';
  $('cue').textContent = 'Enable the camera for a new session.';
  document.querySelectorAll('[data-gesture]').forEach(card => card.classList.remove('active'));
  draw([]);
}

function renderHistory() {
  $('rating-value').textContent = state.rating ?? '—';
  $('rating-count').textContent = `${state.ratingCount} ratings this session`;
  $('confirm-count').textContent = state.confirm; $('no-count').textContent = state.no;
  $('history').innerHTML = state.history.length ? state.history.map(item => {
    const g = findGesture(item.gesture);
    return `<li><span>${g.icon} ${g.name}</span><strong>${item.command ?? 'Recognized'}</strong></li>`;
  }).join('') : '<li>No actions yet.</li>';
}

const camera = new GestureCamera({ video,
  onStatus({ state: status, sessionId, source }) {
    $('start').disabled = true; $('stop').disabled = false;
    if (status === 'requesting') {
      recognizer = new GestureActions({ sessionId, source }, { mode: $('mode').value }); state = initialState({ sessionId, source });
      lastAction = null; renderHistory(); $('feedback').textContent = 'Your next gesture goes here.';
      $('status').textContent = 'Allow camera access'; $('detail').textContent = 'Use the browser permission prompt. Stop cancels this attempt.';
    } else if (status === 'loading') {
      $('status').textContent = 'Loading the local gesture model'; $('detail').textContent = 'The first initialization may take a few seconds.';
    } else {
      $('status').textContent = 'Camera is live'; $('detail').textContent = 'Show one hand, with your palm facing the camera.';
      $('camera-tag').textContent = 'CAMERA LIVE'; $('placeholder').hidden = true;
    }
  },
  onFrame(frame, inferenceMs) {
    const action = recognizer.update(frame); if (!action) return;
    const hand = frame.hands.length === 1 ? frame.hands[0] : null;
    const g = findGesture(action.action);
    $('gesture-icon').textContent = g?.icon ?? '—';
    $('gesture-name').textContent = g?.name ?? (frame.hands.length > 1 ? 'Show one hand' : hand ? (ratingMode() ? 'Show a clear number 1–5' : hand.category === 'None' ? 'Unknown gesture (None)' : 'Uncertain gesture') : 'No hand detected');
    $('confidence').textContent = ratingMode() ? 'Experimental finger geometry · No numeric confidence score' : hand ? `Model confidence ${Math.round(hand.score * 100)}% · ${hand.category.replaceAll('_', ' ')}` : 'Model confidence —';
    $('hold').value = action.progress; $('cue').textContent = action.cue;
    $('timing').textContent = `${Math.round(inferenceMs)} ms model inference · Camera input`;
    document.querySelectorAll('[data-gesture]').forEach(card => card.classList.toggle('active', card.dataset.gesture === action.action));
    draw(frame.hands);
    const next = consumeAction(state, action);
    if (next.history[0]?.id !== state.history[0]?.id) {
      lastAction = next.history[0];
      $('feedback').textContent = lastAction.command ? `${lastAction.rating || lastAction.command === 'Confirm' ? '✓' : '✕'} ${lastAction.command}` : `${g.name} recognized`;
    }
    state = next; renderHistory();
  },
  onStop({ reason }) {
    resetLive(); $('status').textContent = 'Camera stopped';
    $('detail').textContent = reason === 'hidden' ? 'The tab was hidden. Enable the camera when you return.' : 'Camera tracks and the model worker have been released.';
  },
  onError(error) {
    $('status').textContent = error.name === 'NotAllowedError' ? 'Camera permission denied' : 'Camera could not start or continue';
    $('detail').textContent = error.name === 'NotAllowedError' ? 'Allow camera access in your browser settings, then try again.' : error.message;
  },
});
$('mode').addEventListener('change', () => {
  camera.stop('mode-change');
  state = initialState({ sessionId: '', source: { kind: 'camera', id: '' } });
  lastAction = null; renderHistory(); resetLive();
  $('control-counts').hidden = ratingMode(); $('rating-panel').hidden = !ratingMode();
  $('gesture-library').hidden = ratingMode(); $('rating-library').hidden = !ratingMode();
  $('mode-help').textContent = ratingMode() ? 'Show 1–5 and hold still to preview a rating. Confirm / No is inactive.' : 'Thumbs up confirms; a sideways wave says No.';
  $('feedback').textContent = 'Your next gesture goes here.';
  $('status').textContent = 'Ready when you are';
  $('detail').textContent = 'Enable the camera to start a new session in this mode.';
});
$('start').addEventListener('click', () => camera.start());
$('stop').addEventListener('click', () => camera.stop());
// Read-only diagnostics: no raw landmarks, video frames or external command injection.
window.gestureLab = { getState: () => ({ running: camera.running, active: camera.active, mode: $('mode').value, rating: state?.rating ?? null, ratingCount: state?.ratingCount ?? 0,
  confirm: state?.confirm ?? 0, no: state?.no ?? 0, lastAction: lastAction ? { ...lastAction } : null }) };
