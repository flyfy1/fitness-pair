import './style.css';
import { adaptResult, bodyEdges, usable, pinchRatio } from './adapter.js';
import { drawHand } from './hand-overlay.js';
const $ = id => document.getElementById(id);
const video = $('camera'), canvas = $('overlay'), ctx = canvas.getContext('2d');
let mode = 'hands', generation = 0, stream, worker, timer, watchdog, animation;
let active = false, pending = false, inFlight = false, lastVideo = -1, lastSent = -1, lastResult = 0, seq = 0;
let sessionId, source;
const guides = {
  hands: 'Show one or both hands. Move your index finger, then bring your thumb and index finger together.',
  full: 'Step back until your shoulders and ankles are visible. Move your arms and legs within the frame.',
  upper: 'Stay seated or stand close enough to show your shoulders, elbows and wrists. Legs can stay outside the frame.',
};
function status(title, detail) { $('status').textContent = title; $('detail').textContent = detail; }
function stop(title = 'Camera is off', detail = 'Enable your camera to start a fresh tracking session.') {
  generation++; active = pending = inFlight = false;
  clearTimeout(timer); clearInterval(watchdog); cancelAnimationFrame(animation);
  worker?.terminate(); worker = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.pause(); video.srcObject = null; ctx.clearRect(0, 0, canvas.width, canvas.height);
  $('placeholder').hidden = false; $('source').textContent = 'CAMERA OFF';
  $('start').hidden = false; $('start').disabled = false; $('start').textContent = 'Enable camera'; $('stop').hidden = true;
  for (const id of ['points','timing','rate']) $(id).textContent = '—';
  $('movement').textContent = 'Live movement feedback appears here.';
  $('hand-details').replaceChildren();
  status(title, detail);
}
function fail(error) {
  const messages = {
    NotAllowedError: ['Camera permission denied', 'Allow camera access in the browser, then retry.'],
    NotFoundError: ['No camera found', 'Connect a camera, then retry.'],
    NotReadableError: ['Camera unavailable', 'The camera may be in use by another app. Close it there and retry.'],
  };
  stop(...(messages[error.name] ?? ['Tracking could not start or continue', 'Check your camera connection and retry in a recent Chrome or Edge browser.']));
}
async function start() {
  stop(); const token = generation; const selected = mode;
  pending = true; seq = 0; lastVideo = lastSent = -1; sessionId = crypto.randomUUID(); source = { kind: 'camera', id: sessionId };
  $('start').disabled = true; $('start').textContent = 'Starting camera…'; $('stop').hidden = false;
  status('Allow camera access', 'Video only. The tracking model will run locally.');
  timer = setTimeout(() => { if (token === generation) fail(new Error('Camera or model startup timed out. Check permission and retry.')); }, 30_000);
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs localhost or HTTPS.');
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    if (token !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (token === generation) stop('Camera disconnected', 'Reconnect the camera and enable it again.');
    }, { once: true }));
    video.srcObject = stream; await video.play(); if (token !== generation) return;
    $('placeholder').hidden = true; $('source').textContent = 'LIVE CAMERA · LOCAL';
    $('start').textContent = 'Loading model…'; status('Loading local tracking', 'Keep the selected body area visible.');
    worker = new Worker(`${import.meta.env.BASE_URL}runtime/tracking-worker.js`);
    worker.onerror = () => { if (token === generation) fail(new Error('Model worker failed. Reload and retry.')); };
    worker.onmessage = ({ data }) => {
      if (token !== generation) return;
      if (data.type === 'error') { fail(new Error(data.message)); return; }
      if (data.type === 'ready') {
        clearTimeout(timer); active = true; pending = false; lastResult = performance.now();
        $('start').hidden = true; status('Looking for landmarks', guides[selected]);
        watchdog = setInterval(() => { if (performance.now() - lastResult > 8_000) fail(new Error('No tracking result for 8 seconds. Camera released; retry to continue.')); }, 500);
        animation = requestAnimationFrame(() => tick(token));
      } else if (data.type === 'result') {
        inFlight = false;
        try {
          const now = performance.now(); const hz = 1000 / Math.max(1, now - lastResult); lastResult = now;
          const frame = adaptResult(data, { sessionId, seq: seq++, tMs: data.time, source,
            width: video.videoWidth, height: video.videoHeight }, selected);
          render(frame);
          $('timing').textContent = `${Math.round(data.inferenceMs)} ms`; $('rate').textContent = `${hz.toFixed(1)} Hz`;
        } catch (error) { fail(error); }
      }
    };
    worker.postMessage({ type: 'init', mode: selected });
  } catch (error) { if (token === generation) fail(error); }
}
async function tick(token) {
  if (!active || token !== generation) return;
  animation = requestAnimationFrame(() => tick(token));
  const time = performance.now();
  if (inFlight || video.readyState < 2 || video.currentTime === lastVideo || time - lastSent < 66) return;
  inFlight = true; lastVideo = video.currentTime; lastSent = time;
  try {
    const bitmap = await createImageBitmap(video);
    if (token !== generation) { bitmap.close(); return; }
    try { worker.postMessage({ type: 'frame', bitmap, time }, [bitmap]); }
    catch (error) { bitmap.close(); throw error; }
  } catch (error) { if (token === generation) fail(error); }
}
function render(frame) {
  // Canvas and video share intrinsic aspect and object-fit:contain. CSS mirrors both only for display.
  canvas.width = frame.image.width; canvas.height = frame.image.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sets = mode === 'hands' ? frame.hands.map(hand => hand.joints) : [frame.joints];
  const total = sets.reduce((n, joints) => n + Object.values(joints).filter(usable).length, 0);
  const expected = mode === 'hands' ? Math.max(1, sets.length) * 21 : mode === 'upper' ? 6 : 12;
  $('points').textContent = `${total} / ${expected}`;
  const colors = ['#d2f793', '#8de3ef'];
  sets.forEach((joints, i) => {
    if (mode === 'hands') { drawHand(ctx, joints, frame.image); return; }
    ctx.strokeStyle = ctx.fillStyle = colors[i % colors.length]; ctx.lineWidth = Math.max(2, canvas.width / 280);
    for (const [a, b] of bodyEdges) if (usable(joints[a]) && usable(joints[b])) {
      ctx.beginPath(); ctx.moveTo(joints[a].x * canvas.width, joints[a].y * canvas.height);
      ctx.lineTo(joints[b].x * canvas.width, joints[b].y * canvas.height); ctx.stroke();
    }
    for (const p of Object.values(joints).filter(usable)) {
      ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, canvas.width / 180, 0, Math.PI * 2); ctx.fill();
    }
  });
  if (mode === 'hands') {
    $('hand-details').replaceChildren(...frame.hands.map((hand, i) => {
      const item = document.createElement('li');
      const count = Object.values(hand.joints).filter(usable).length;
      const score = Number.isFinite(hand.sideConfidence) ? ` · ${Math.round(hand.sideConfidence * 100)}% side confidence` : '';
      item.textContent = `Hand ${i + 1}: ${hand.side} · ${count} landmarks${score}`;
      return item;
    }));
    status(total ? `${frame.hands.length} hand${frame.hands.length === 1 ? '' : 's'} detected` : 'No hands detected', total ? 'The ring follows your index fingertip.' : guides.hands);
    $('movement').textContent = frame.hands.map((hand, i) => {
      const ratio = pinchRatio(hand.joints, frame.image);
      return `Hand ${i + 1}: ${ratio === null ? 'pinch unavailable' : `${ratio < .3 ? 'pinch' : 'apart'} · gap ${ratio.toFixed(2)}× palm`}`;
    }).join(' / ') || 'Show your hands with fingers visible.';
  } else {
    status(total === expected ? 'Body landmarks detected' : total ? 'Partial body tracking' : 'No body detected', total === expected ? 'Move slowly and watch the joints follow.' : guides[mode]);
    const raised = ['left','right'].filter(side => usable(frame.joints[`${side}Wrist`]) && usable(frame.joints[`${side}Shoulder`]) && frame.joints[`${side}Wrist`].y < frame.joints[`${side}Shoulder`].y);
    $('movement').textContent = raised.length ? `Wrist above shoulder: ${raised.join(' + ')} (anatomical side)` : 'Raise a hand above your shoulder to see a movement cue.';
  }
}
$('start').addEventListener('click', start);
$('stop').addEventListener('click', () => stop());
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.mode === mode) return;
  stop('Mode selected · camera off', 'Enable your camera to try this mode.'); mode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  $('guide').textContent = guides[mode];
  $('hand-observation').hidden = mode !== 'hands';
}));
document.addEventListener('visibilitychange', () => { if (document.hidden && (active || pending)) stop('Paused · camera off', 'Enable your camera again when you return.'); });
window.addEventListener('pagehide', () => stop());
