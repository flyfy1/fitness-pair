import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseCamera } from '../packages/pose-mediapipe/camera.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

function environment(t, { media, bitmap, inferenceTimeoutMs, players } = {}) {
  const track = new EventTarget();
  track.stops = 0;
  track.stop = () => { track.stops += 1; };
  const stream = { getTracks: () => [track] };
  const video = { srcObject: null, play: async () => {}, pause() {}, readyState: 2,
    currentTime: 0, videoWidth: 640, videoHeight: 480 };
  const workers = [];
  class FakeWorker {
    constructor() { this.sent = []; this.terminated = false; workers.push(this); }
    postMessage(message) { this.sent.push(message); }
    terminate() { this.terminated = true; }
    emit(data) { this.onmessage?.({ data }); }
  }
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = Object.assign(new EventTarget(), { isSecureContext: true, location: { href: 'http://localhost/' } });
  const raf = new Map();
  let rafId = 0;
  const globals = { document, window, navigator: { mediaDevices: { getUserMedia: () => media?.promise ?? Promise.resolve(stream) } },
    Worker: FakeWorker, requestAnimationFrame: callback => { raf.set(++rafId, callback); return rafId; },
    cancelAnimationFrame: id => raf.delete(id),
    createImageBitmap: () => bitmap?.promise ?? Promise.resolve({ close() {} }) };
  const restoreGlobals = [];
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    restoreGlobals.push(() => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]);
  }
  const poses = [], playerFrames = [], statuses = [], errors = [], stops = [];
  const camera = new PoseCamera({ video, players, inferenceTimeoutMs, onPlayers: frames => playerFrames.push(frames), onPose: pose => poses.push(pose), onStatus: status => statuses.push(status),
    onError: error => errors.push(error), onStop: stop => stops.push(stop) });
  t.after(() => { camera.stop(); restoreGlobals.forEach(restore => restore()); });
  return { camera, track, stream, video, workers, document, poses, playerFrames, statuses, errors, stops,
    frame(time) { const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(callback => callback(time)); } };
}

test('cancelling pending permission resolves promptly and stops a late camera grant', async t => {
  const media = deferred();
  const env = environment(t, { media });
  const ready = env.camera.start();
  assert.equal(env.camera.active, true);
  env.camera.stop('cancelled');
  assert.equal(await ready, null);
  media.resolve(env.stream);
  await flush();
  assert.equal(env.track.stops, 1);
  assert.equal(env.workers.length, 0);
  assert.equal(env.stops.length, 1);
  assert.deepEqual(env.errors, []);
});

test('two-player camera keeps stable lane sessions when detection order changes or a player disappears', async t => {
  const env = environment(t, {players: 2});
  const ready = env.camera.start(); await flush();
  const worker = env.workers[0];
  assert.equal(worker.sent[0].numPoses, 2);
  worker.emit({type: 'ready'}); const session = await ready;
  assert.notEqual(session.players[0].sessionId, session.players[1].sessionId);
  const person = x => { const joints = []; for (const id of [11,12]) joints[id] = {x: x + (id === 11 ? -.04 : .04), y: .3, visibility: .99}; return joints; };
  for (const [i, poses] of [[person(.25),person(.75)], [person(.75),person(.25)], [person(.25)]].entries()) {
    env.video.currentTime = i + 1; env.frame(100 + i * 50); await flush();
    worker.emit({type: 'pose', poses, time: 100 + i * 50});
  }
  assert.equal(env.poses.length, 0);
  for (const frames of env.playerFrames) {
    assert.equal(frames[0].sessionId, session.players[0].sessionId);
    assert.equal(frames[1].sessionId, session.players[1].sessionId);
    assert.deepEqual(frames[0].source, session.source);
    assert.equal(frames[0].tMs, frames[1].tMs);
  }
  assert.deepEqual(env.playerFrames[0].map(frame => frame.joints.leftShoulder.x), [.71, .21]);
  assert.deepEqual(env.playerFrames[1].map(frame => frame.joints.leftShoulder.x), [.71, .21]);
  assert.deepEqual(env.playerFrames[2][0].joints, {});
  assert.equal(env.playerFrames[2][1].seq, 3);
  env.camera.stop(); assert.equal(worker.terminated, true); assert.equal(env.track.stops, 1);
});

test('ready precedes named poses and output retains original input timestamp and provenance', async t => {
  const env = environment(t);
  const ready = env.camera.start();
  await flush();
  env.workers[0].emit({ type: 'ready' });
  const session = await ready;
  assert.deepEqual(env.statuses.map(status => status.state), ['requesting', 'loading', 'ready']);
  assert.equal(env.camera.running, true);
  env.frame(100);
  await flush();
  env.video.currentTime = 1;
  env.frame(150);
  assert.equal(env.workers[0].sent.filter(message => message.type === 'frame').length, 1);
  const landmarks = [];
  landmarks[23] = { x: 0.4, y: 0.5, visibility: 0.99 };
  env.workers[0].emit({ type: 'pose', time: 100, landmarks });
  assert.equal(env.poses[0].tMs, 100);
  assert.equal(env.poses[0].sessionId, session.sessionId);
  assert.deepEqual(env.poses[0].source, session.source);
  assert.deepEqual(env.poses[0].joints, { leftHip: { x: 0.4, y: 0.5, confidence: 0.99 } });
  env.frame(200);
  await flush();
  env.workers[0].emit({ type: 'pose', time: 100, landmarks });
  assert.equal(env.poses.length, 1);
  env.workers[0].emit({ type: 'pose', time: 200, landmarks: [] });
  assert.equal(env.poses[1].seq, 2);
  assert.deepEqual(env.poses[1].joints, {});
});

test('stopping during bitmap creation closes the late bitmap without sending it', async t => {
  const bitmap = deferred();
  const env = environment(t, { bitmap });
  const ready = env.camera.start();
  await flush();
  const worker = env.workers[0];
  worker.emit({ type: 'ready' });
  await ready;
  env.frame(100);
  env.camera.stop('cancelled');
  let closed = 0;
  bitmap.resolve({ close() { closed += 1; } });
  await flush();
  assert.equal(closed, 1);
  assert.equal(worker.sent.length, 1);
  assert.equal(worker.terminated, true);
  assert.equal(env.video.srcObject, null);
  assert.equal(env.track.stops, 1);
  assert.deepEqual(env.errors, []);
});

test('old worker responses cannot affect a restarted session', async t => {
  const env = environment(t);
  const first = env.camera.start();
  await flush();
  const oldReceiver = env.workers[0].onmessage;
  env.camera.stop();
  assert.equal(await first, null);
  const second = env.camera.start();
  await flush();
  oldReceiver({ data: { type: 'error', message: 'stale failure' } });
  assert.equal(env.camera.active, true);
  assert.deepEqual(env.errors, []);
  env.workers[1].emit({ type: 'ready' });
  assert.ok(await second);
});

test('hidden tab ends camera/model ownership once', async t => {
  const env = environment(t);
  const ready = env.camera.start();
  await flush();
  env.workers[0].emit({ type: 'ready' });
  await ready;
  env.document.hidden = true;
  env.document.dispatchEvent(new Event('visibilitychange'));
  env.camera.stop();
  assert.equal(env.camera.active, false);
  assert.equal(env.workers[0].terminated, true);
  assert.equal(env.track.stops, 1);
  assert.equal(env.stops[0].reason, 'hidden');
  assert.equal(env.stops.length, 1);
});

test('permission denial preserves the browser error name and clears the attempt', async t => {
  const env = environment(t);
  const denied = new DOMException('Camera access denied', 'NotAllowedError');
  navigator.mediaDevices.getUserMedia = async () => { throw denied; };
  assert.equal(await env.camera.start(), null);
  assert.equal(env.camera.active, false);
  assert.equal(env.errors[0].name, 'NotAllowedError');
  assert.equal(env.workers.length, 0);
  assert.equal(env.stops[0].reason, 'error');
});

test('a disconnected camera reports an error and terminates its worker', async t => {
  const env = environment(t);
  const ready = env.camera.start();
  await flush();
  env.workers[0].emit({ type: 'ready' });
  await ready;
  env.track.dispatchEvent(new Event('ended'));
  assert.equal(env.camera.active, false);
  assert.match(env.errors[0].message, /disconnected/);
  assert.equal(env.workers[0].terminated, true);
  assert.equal(env.track.stops, 1);
});

test('initialization timeout ends owned resources and resolves start', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const env = environment(t);
  const ready = env.camera.start();
  await flush();
  t.mock.timers.tick(330_001);
  assert.equal(await ready, null);
  assert.match(env.errors[0].message, /initialization timed out/);
  assert.equal(env.workers[0].terminated, true);
  assert.equal(env.track.stops, 1);
});

test('stalled inference errors after one second and releases camera and worker', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const env = environment(t);
  let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  const ready = env.camera.start();
  await flush();
  env.workers[0].emit({ type: 'ready' });
  await ready;
  clock = 1001;
  t.mock.timers.tick(1100);
  assert.match(env.errors[0].message, /tracking stalled/);
  assert.equal(env.camera.active, false);
  assert.equal(env.workers[0].terminated, true);
  assert.equal(env.track.stops, 1);
});


test('game timeout tolerates a slow result but still bounds a stalled worker', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const env=environment(t,{inferenceTimeoutMs:8000});let clock=0;
  t.mock.method(performance,'now',()=>clock);
  const ready=env.camera.start();await flush();env.workers[0].emit({type:'ready'});await ready;
  env.frame(40);await flush();clock=1500;t.mock.timers.tick(1500);
  assert.equal(env.camera.active,true);assert.equal(env.errors.length,0);
  env.workers[0].emit({type:'pose',landmarks:[],time:40});
  assert.equal(env.poses.length,1);
  clock=9499;t.mock.timers.tick(100);assert.equal(env.camera.active,true);
  clock=9501;t.mock.timers.tick(100);assert.equal(env.camera.active,false);
  assert.equal(env.workers[0].terminated,true);assert.equal(env.track.stops,1);
});
