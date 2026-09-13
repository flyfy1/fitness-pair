import './style.css';
import { PoseCamera } from '../../dino-run/src/camera.js';
import { drawBody } from '../../camera-start/src/body-overlay.js';
import { squatSession } from '../../../contracts/fixtures/squat-session.js';
import { newSession, createRecognizer, validateSession, replaySession, MAX_FRAMES, MAX_DURATION_MS, MAX_BYTES } from './session.js';
import { saveSession, listSessions, loadSession, deleteSession } from './storage.js';

const $ = id => document.getElementById(id);
let session = null, recognizer, replay = null, index = 0, recording = false, playTimer = null, lastPoseAt = 0;
let transitioning = false;
let dirty = false, formDirty = false, autosaving = false, saving = Promise.resolve(), captureLimit;
const notice = message => { $('notice').textContent = message; };
function download(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refreshLibrary() {
  const rows = await listSessions();
  $('library').replaceChildren(new Option(rows.length ? 'Select a saved session' : 'No saved sessions yet', ''),
    ...rows.map(s => new Option(`${s.name} · ${s.frames} frames · ${new Date(s.createdAt).toLocaleString()}`, s.id)));
  if (session) $('library').value = session.id;
}
function persist() {
  if (!session?.samples.length) return Promise.resolve(true);
  if (formDirty) {
    try { applyFields(); } catch (error) { notice(error.message); return Promise.resolve(false); }
  }
  const snapshot = structuredClone(session);
  saving = saving.catch(() => {}).then(async () => {
    try {
      await saveSession(snapshot);
      // Only clear dirty if the in-memory object still equals the saved snapshot.
      if (session?.id === snapshot.id && JSON.stringify(session) === JSON.stringify(snapshot)) dirty = false;
      $('storage-status').textContent = `Saved on this device · ${snapshot.samples.length} frames · ${new Date().toLocaleTimeString()}`;
      await refreshLibrary(); return true;
    } catch (error) {
      $('storage-status').textContent = `Not saved: ${error.message}. Export JSON before closing.`;
      notice('Local save failed. Stop and export JSON to keep your data.'); return false;
    }
  });
  return saving;
}
async function preserve() {
  if (!dirty) return true;
  return persist();
}
function setControls() {
  for (const id of ['start', 'demo', 'profile', 'import', 'library']) $(id).disabled = recording || transitioning;
  $('stop').disabled = !recording;
  $('mark').disabled = !recording || !session?.samples.length;
  $('review').hidden = recording || !session?.samples.length;
}
function stateText(a, sample) {
  return JSON.stringify({ ...a,
    ...(sample ? { resultDelayMs: Math.round(sample.resultDelayMs), jointCount: Object.keys(sample.pose.joints).length } : {}) }, null, 2);
}
function showFrame() {
  if (!session?.samples.length) return;
  const sample = session.samples[index];
  drawBody($('skeleton'), sample.pose);
  const elapsed = (sample.pose.tMs - session.samples[0].pose.tMs) / 1000;
  $('stats').textContent = `${session.samples.length} frames · ${elapsed.toFixed(1)} s`;
  $('scrub').value = index; $('position').textContent = `${index + 1} / ${session.samples.length} · ${elapsed.toFixed(2)} s`;
  if (!recording) {
    $('review-skeleton').style.aspectRatio = `${sample.pose.image.width} / ${sample.pose.image.height}`;
    $('review-skeleton').style.maxWidth = `${400 * sample.pose.image.width / sample.pose.image.height}px`;
    drawBody($('review-skeleton'), sample.pose);
    $('mode').textContent = `REPLAY · ${session.evidence.toUpperCase()}`;
    $('cue').textContent = replay?.outputs[index]?.cue.replaceAll('-', ' ') ?? sample.observed.cue;
    $('hint').textContent = 'Skeleton replay · Camera off · Original sampling times';
    $('recorded').textContent = stateText(sample.observed, sample);
    $('current').textContent = replay ? stateText(replay.outputs[index]) : 'Run test to recompute.';
  }
}
function stopPlayback() { clearTimeout(playTimer); playTimer = null; $('play').textContent = 'Play replay'; }
function renderAnnotations() {
  $('window').textContent = `Frames ${session.test.start + 1}–${(session.test.end ?? session.samples.length - 1) + 1}`;
  for (const [id, values, description] of [
    ['markers', session.markers, a => `Frame ${a.index + 1}: ${a.note || 'Issue marked during capture'}`],
    ['assertions', session.test.states, a => `Frame ${a.index + 1}: expect ${a.phase}`],
  ]) {
    $(id).replaceChildren(...values.map((a, i) => {
      const li = document.createElement('li'), jump = document.createElement('button'), remove = document.createElement('button');
      jump.textContent = description(a); jump.onclick = () => { stopPlayback(); index = a.index; showFrame(); $('stage').scrollIntoView({ behavior: 'smooth' }); };
      remove.textContent = 'Remove'; remove.onclick = async () => { values.splice(i, 1); dirty = true; renderAnnotations(); run(); await persist(); };
      li.append(jump, remove); return li;
    }));
  }
}
function run() {
  replay = replaySession(session); $('test-status').textContent = replay.report.status; $('test-status').dataset.status = replay.report.status; replay.report.replayRevision = __LAB_REVISION__;
  $('report').textContent = JSON.stringify(replay.report, null, 2); showFrame();
}
function review() {
  if (!session?.samples.length) { setControls(); return; }
  index = Math.min(index, session.samples.length - 1);
  $('name').value = session.name; $('profile').value = session.profile;
  $('evidence').textContent = `${session.evidence} · ${session.profile} · ${session.samples[0].pose.modelId}`;
  $('scrub').max = session.samples.length - 1;
  $('expected').value = session.test.expectedCount ?? ''; $('case-note').value = session.test.note;
  renderAnnotations(); setControls(); run();
}
function finish(reason) {
  clearTimeout(captureLimit); recording = false;
  drawBody($('skeleton'), null); setControls();
  if (session?.samples.length) { review(); void persist(); }
  else { $('mode').textContent = 'CAMERA OFF'; $('cue').textContent = 'Ready when you are.'; }
  notice(`Capture stopped (${reason}). ${session?.samples.length ? 'Review the saved skeleton below.' : 'No skeleton frames captured.'}`);
}
const camera = new PoseCamera({ video: $('camera'),
  onStatus(status) {
    $('mode').textContent = status.state.toUpperCase();
    if (status.state === 'requesting') recognizer.reset(status);
    $('cue').textContent = status.state === 'ready' ? 'Stand still to calibrate' : 'Starting camera…';
    $('hint').textContent = 'Keep your body visible. Capture includes calibration and tracking gaps.';
  },
  onPose(pose) {
    if (!recording) return;
    if (session.samples.length >= MAX_FRAMES || session.samples.length && pose.tMs - session.samples[0].pose.tMs > MAX_DURATION_MS) { camera.stop('session limit'); return; }
    const observed = recognizer.update(pose); if (!observed) return;
    session.samples.push({ pose, observed, resultDelayMs: Math.max(0, performance.now() - pose.tMs) });
    dirty = true; index = session.samples.length - 1; lastPoseAt = performance.now();
    $('mode').textContent = 'RECORDING · LOCAL'; $('cue').textContent = observed.cue.replaceAll('-', ' ');
    $('hint').textContent = `${observed.phase} · ${Math.round(observed.progress * 100)}% response · Mark anything unexpected`;
    $('mark').disabled = false; showFrame();
  },
  onStop: ({ reason }) => finish(reason),
  onError(error) { notice(`Camera error: ${error.message}. Start capture to retry.`); },
});
$('start').onclick = async () => {
  if (!await preserve()) return;
  stopPlayback(); session = newSession($('profile').value); session.runtime = { revision: __LAB_REVISION__, userAgent: navigator.userAgent }; recognizer = createRecognizer(session.profile);
  replay = null; index = 0; recording = true; dirty = false;
  $('stats').textContent = '0 frames · 0.0 s'; drawBody($('skeleton'), null); setControls();
  notice('Recording skeleton locally. Press M to mark an issue.');
  captureLimit = setTimeout(() => camera.stop('five-minute limit'), MAX_DURATION_MS);
  void camera.start();
};
$('stop').onclick = async () => {
  camera.stop('user');
  if (document.fullscreenElement === $('stage')) { try { await document.exitFullscreen(); } catch { /* The exit button remains available. */ } }
  if (session?.samples.length) $('review').scrollIntoView({ behavior: 'smooth' });
};
function mark(note = '') {
  if (!session?.samples.length || session.markers.length >= MAX_FRAMES) return;
  session.markers.push({ index, note }); dirty = true;
  notice(`Issue marked at frame ${index + 1}. Add details during review.`);
  if (!recording) { renderAnnotations(); void persist(); }
}
$('mark').onclick = () => mark(); $('add-marker').onclick = () => { mark($('issue-note').value); $('issue-note').value = ''; };
window.addEventListener('keydown', event => { if (event.code === 'KeyM' && recording && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); mark(); } });
setInterval(() => { if (recording && dirty && !autosaving) { autosaving = true; void persist().finally(() => { autosaving = false; }); } }, 2000);
setInterval(() => { if (recording && performance.now() - lastPoseAt > 250) drawBody($('skeleton'), null); }, 100);
window.addEventListener('resize', () => { if (session?.samples.length && (!recording || performance.now() - lastPoseAt < 250)) showFrame(); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
$('demo').onclick = async () => {
  if (!await preserve()) return;
  stopPlayback(); session = newSession('squat', 'synthetic'); session.name = 'Synthetic squat · 2 repetitions';
  const frames = squatSession(2), r = createRecognizer('squat'); r.reset(frames[0]);
  for (const pose of frames) {
    for (const [side, offset] of [['left', -.075], ['right', .075]]) {
      for (const [name, joint] of Object.entries(pose.joints)) if (name.startsWith(side)) joint.x += offset;
      pose.joints[side + 'Elbow'] = { x: .5 + offset * 1.5, y: .36, confidence: 1 };
      pose.joints[side + 'Wrist'] = { x: .5 + offset * 1.8, y: .51, confidence: 1 };
    }
  }
  session.runtime = { revision: __LAB_REVISION__ };
  session.samples = frames.map(pose => ({ pose, observed: r.update(pose), resultDelayMs: 0 }));
  session.test.expectedCount = 2; dirty = true; index = 0; review(); await persist();
  notice('Synthetic geometry demonstration. This is not a recording of your movement.');
};
$('library').onchange = async () => {
  const id = $('library').value; if (!id) return;
  if (!await preserve()) { $('library').value = session?.id ?? ''; return; }
  try { const next = validateSession(await loadSession(id)); stopPlayback(); session = next; index = 0; dirty = false; review(); }
  catch (error) { notice(`Cannot open session: ${error.message}`); }
};
$('import').onchange = async () => {
  const file = $('import').files[0]; if (!file) return;
  try {
    if (!await preserve()) return;
    if (file.size > MAX_BYTES) throw new Error('File exceeds 32 MiB');
    const next = validateSession(JSON.parse(await file.text())); next.id = crypto.randomUUID();
    stopPlayback(); session = next; index = 0; dirty = true; review(); await persist();
    notice('Imported into your local library. Evidence label retained from the file.');
  } catch (error) { notice(`Import rejected: ${error.message}`); }
  finally { $('import').value = ''; }
};
$('scrub').oninput = () => { stopPlayback(); index = Number($('scrub').value); showFrame(); };
$('play').onclick = () => {
  if (playTimer) { stopPlayback(); return; }
  if (index >= session.samples.length - 1) index = 0;
  const started = performance.now(), inputStart = session.samples[index].pose.tMs;
  $('play').textContent = 'Pause replay'; $('stage').scrollIntoView({ behavior: 'smooth' });
  const tick = () => {
    const target = inputStart + performance.now() - started;
    while (index + 1 < session.samples.length && session.samples[index + 1].pose.tMs <= target) index++;
    showFrame();
    if (index >= session.samples.length - 1) stopPlayback(); else playTimer = setTimeout(tick, 16);
  }; tick();
};
function applyFields() {
  const value = $('expected').value;
  const count = value.trim() === '' ? null : Number(value);
  if (count !== null && (!Number.isSafeInteger(count) || count < 0 || count > MAX_FRAMES)) throw new Error('Expected count must be a whole number between 0 and 9000.');
  session.name = $('name').value.trim() || 'Untitled session'; session.test.expectedCount = count; session.test.note = $('case-note').value; dirty = true; formDirty = false;
}
for (const id of ['name', 'expected', 'case-note']) $(id).oninput = () => { dirty = true; formDirty = true; try { applyFields(); run(); } catch (error) { notice(error.message); } };
async function saveCase() {
  try { applyFields(); validateSession(session); run(); await persist(); }
  catch (error) { notice(error.message); }
}
$('save-case').onclick = saveCase; $('run').onclick = saveCase;
function windowAt(start, end) {
  if (end !== null && end < start) { notice('Window end must be at or after its start.'); return; }
  const excludes = session.test.states.some(a => a.index < start || a.index > (end ?? session.samples.length - 1));
  if (excludes) { notice('Remove state assertions outside the new window first.'); return; }
  session.test.start = start; session.test.end = end; dirty = true; renderAnnotations(); run(); void persist();
}
$('set-start').onclick = () => windowAt(index, session.test.end);
$('set-end').onclick = () => windowAt(session.test.start, index);
$('reset-window').onclick = () => windowAt(0, null);
$('add-state').onclick = () => {
  if (index < session.test.start || index > (session.test.end ?? session.samples.length - 1)) { notice('Choose a frame inside the test window.'); return; }
  session.test.states = session.test.states.filter(a => a.index !== index);
  session.test.states.push({ index, phase: $('expected-phase').value }); dirty = true; renderAnnotations(); run(); void persist();
};
$('export').onclick = () => {
  try { applyFields(); validateSession(session); download(session, `recognition-${session.id}.json`); }
  catch (error) { notice(error.message); }
};
$('export-report').onclick = () => { try { applyFields(); run(); download(replay.report, `report-${session.id}.json`); } catch (error) { notice(error.message); } };
$('delete').onclick = async () => {
  if (!confirm('Delete this session from this browser? Export first to keep a copy.')) return;
  try { await saving; await deleteSession(session.id); stopPlayback(); session = null; dirty = false; replay = null; drawBody($('skeleton'), null); setControls(); await refreshLibrary(); $('mode').textContent = 'CAMERA OFF'; $('cue').textContent = 'Ready when you are.'; $('stats').textContent = '0 frames · 0.0 s'; notice('Session deleted from this browser.'); }
  catch (error) { notice(`Delete failed: ${error.message}`); }
};
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('stage').requestFullscreen(); }
  catch { notice('Fullscreen is unavailable here. The AR view already fills the window.'); }
};
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
for (const id of ['start', 'demo', 'library', 'import', 'delete']) {
  const property = ['library', 'import'].includes(id) ? 'onchange' : 'onclick';
  const handler = $(id)[property];
  $(id)[property] = async (...args) => {
    if (transitioning) return;
    transitioning = true; setControls();
    try { await handler(...args); } finally { transitioning = false; setControls(); }
  };
}
try { await refreshLibrary(); $('storage-status').textContent = 'Saved sessions stay in this browser until you delete them.'; }
catch (error) { $('storage-status').textContent = `Local storage unavailable: ${error.message}. You can capture and export JSON.`; }
