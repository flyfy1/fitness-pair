import './style.css';
import { toHandFrame, drawHands } from './hands.js';

const $ = id => document.getElementById(id);
const video = $('video'), overlay = $('overlay');
let generation = 0, stream, worker, timer, raf, phase = 'off';
let inFlight = false, lastSent = 0, lastVideoTime = -1, seq = 0, sessionId, lastReceived = -1;

function status(title, hint) { $('status').textContent = title; $('hint').textContent = hint; }
function stop(title = 'Camera off', hint = 'Bring one or two hands close enough to see each finger clearly.') {
  generation++; phase = 'off'; clearTimeout(timer); cancelAnimationFrame(raf);
  worker?.terminate(); worker = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.pause(); video.srcObject = null; inFlight = false;
  overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
  $('placeholder').hidden = false; $('start').disabled = false; $('stop').disabled = true;
  $('count').textContent = '0 / 2'; $('timing').textContent = '—'; $('hands').replaceChildren();
  status(title, hint);
}
function fail(error) {
  const messages = {
    NotAllowedError: ['Camera permission denied', 'Allow camera access in your browser, then try again.'],
    NotFoundError: ['No camera found', 'Connect a camera, then try again.'],
    NotReadableError: ['Camera unavailable', 'Check whether another application is using your camera.'],
  };
  const [title, hint] = messages[error.name] ?? ['Tracking stopped', `${error.message}. Enable the camera to retry.`];
  stop(title, hint);
}
function watchdog(ms, message) {
  clearTimeout(timer); timer = setTimeout(() => fail(new Error(message)), ms);
}

async function start() {
  stop(); const token = generation; phase = 'loading';
  $('start').disabled = true; $('stop').disabled = false;
  status('Waiting for camera permission', 'Allow video access to start local recognition. You can cancel with Stop camera.');
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    fail(new Error('Camera access requires localhost or HTTPS')); return;
  }
  try {
    const next = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } } });
    if (token !== generation) { next.getTracks().forEach(track => track.stop()); return; }
    stream = next;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (token === generation) stop('Camera disconnected', 'Reconnect your camera and enable it again.');
    });
    watchdog(8_000, 'Camera startup timed out');
    video.srcObject = stream; await video.play();
    if (token !== generation) return;
    $('placeholder').hidden = true;
    status('Loading hand model', 'The model runs locally on this device.');
    watchdog(30_000, 'Model initialization timed out');
    worker = new Worker(new URL('runtime/hand-worker.js', document.baseURI));
    worker.onerror = () => { if (token === generation) fail(new Error('Model worker failed')); };
    worker.onmessage = ({ data }) => {
      if (token !== generation) return;
      if (data.type === 'error') { fail(new Error(data.message)); return; }
      if (data.type === 'ready') {
        phase = 'tracking'; seq = 0; lastReceived = -1; lastVideoTime = -1; lastSent = -Infinity;
        sessionId = crypto.randomUUID();
        status('Looking for hands', 'Show one or two hands with your fingers clearly visible.');
        watchdog(8_000, 'Camera or inference stalled'); raf = requestAnimationFrame(tick);
      } else if (data.type === 'hands') {
        if (data.seq <= lastReceived) return;
        lastReceived = data.seq; inFlight = false; watchdog(8_000, 'Camera or inference stalled');
        try {
          const frame = toHandFrame(data, sessionId, { width: video.videoWidth, height: video.videoHeight });
          drawHands(overlay, frame);
          $('count').textContent = `${frame.hands.length} / 2`;
          $('timing').textContent = `${Math.round(data.inferenceMs)} ms`;
          status(frame.hands.length ? 'Hands detected' : 'No hands detected',
            frame.hands.length ? 'Move your fingers and watch the colored landmarks follow.' : 'Bring your hands into view, closer to the camera.');
          $('hands').replaceChildren(...frame.hands.map(hand => {
            const li = document.createElement('li');
            li.textContent = `${hand.side} hand · 21 landmarks${hand.handednessScore === null ? '' : ` · ${Math.round(hand.handednessScore * 100)}% side confidence`}`;
            return li;
          }));
        } catch (error) { fail(error); }
      }
    };
    worker.postMessage({ type: 'init' });
  } catch (error) { if (token === generation) fail(error); }
}
function tick(tMs) {
  if (phase !== 'tracking') return;
  raf = requestAnimationFrame(tick);
  if (inFlight || video.readyState < 2 || video.currentTime === lastVideoTime || tMs - lastSent < 60) return;
  inFlight = true; lastSent = tMs; lastVideoTime = video.currentTime;
  const token = generation, inputSeq = seq++;
  createImageBitmap(video).then(bitmap => {
    if (token !== generation || !worker) { bitmap.close(); return; }
    try { worker.postMessage({ type: 'frame', bitmap, tMs, seq: inputSeq }, [bitmap]); }
    catch (error) { bitmap.close(); throw error; }
  }).catch(error => { if (token === generation) fail(error); });
}
$('start').addEventListener('click', start);
$('stop').addEventListener('click', () => stop());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase !== 'off') stop('Tracking paused', 'Tracking stopped because this page was hidden. Enable the camera to resume.');
});
window.addEventListener('pagehide', () => stop());
