import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squatSession } from '../../../contracts/fixtures/squat-session.js';
import { newSession, createRecognizer, validateSession, replaySession } from '../src/session.js';
export function fixture() {
  const s = newSession('squat', 'synthetic'), frames = squatSession(2), recognizer = createRecognizer('squat');
  recognizer.reset(frames[0]);
  s.samples = frames.map(pose => ({ pose, observed: recognizer.update(pose), resultDelayMs: 4 }));
  return s;
}
test('round trip retains data; replay uses new identity, input times and manual expectations', () => {
  const s = fixture(), original = JSON.stringify(s);
  assert.equal(replaySession(s).report.status, 'UNLABELED');
  s.test.expectedCount = 2;
  const { outputs, report } = replaySession(JSON.parse(JSON.stringify(s)), 'fresh-replay');
  assert.equal(report.status, 'PASS'); assert.equal(report.observedCount, 2);
  assert.equal(outputs[0].source.kind, 'replay'); assert.equal(outputs[0].sessionId, 'fresh-replay');
  assert.equal(outputs[0].tMs, s.samples[0].pose.tMs);
  assert.equal(report.falseCompletions, null);
  s.test.expectedCount = null; assert.equal(JSON.stringify(s), original);
});
test('test windows retain calibration prefix and detect bad count/state expectations', () => {
  const s = fixture(); s.test = { start: 30, end: 53, expectedCount: 1, states: [{ index: 30, phase: s.samples[30].observed.phase }], note: '' };
  assert.equal(replaySession(s).report.status, 'PASS');
  s.test.expectedCount = 2; assert.equal(replaySession(s).report.status, 'FAIL');
  s.test.expectedCount = null; s.test.states[0].phase = 'missing';
  assert.equal(replaySession(s).report.status, 'FAIL');
});
test('invalid data, foreign observations, mixed provenance and invalid annotations are rejected', () => {
  const mutations = [s => s.samples[1].pose.tMs = 0, s => s.samples[1].pose.seq = 0,
    s => s.samples[1].pose.sessionId = 'other', s => s.samples[1].pose.modelId = 'other',
    s => s.samples[1].observed.inputSeq = 999, s => s.samples[0].pose.joints.leftHip.x = Infinity,
    s => s.test.end = 999, s => s.test.expectedCount = -1, s => s.evidence = 'consented-human',
    s => s.markers.push({ index: -1, note: '' }), s => s.test.states.push({ index: 0, phase: 'invented' })];
  for (const mutate of mutations) { const s = fixture(); mutate(s); assert.throws(() => validateSession(s)); }
});
test('empty detections and sampling gaps survive recording and replay', () => {
  const s = fixture(); const r = createRecognizer('squat'); r.reset(s.samples[0].pose);
  s.samples.forEach((sample, i) => { if (i >= 35 && i < 50) sample.pose.joints = {}; sample.observed = r.update(sample.pose); });
  assert.equal(replaySession(s).outputs[40].phase, 'missing');
});
test('jump replay reconstructs automatic maximum calibration and landing completions', () => {
  const s = newSession('jump-height', 'synthetic'), r = createRecognizer(s.profile);
  const source = { kind: 'synthetic', id: 'jump-replay-test' }, sessionId = 'jump-calibration';
  r.reset({ source, sessionId });
  const add = rise => {
    const joints = {};
    for (const [side, x] of [['left', .44], ['right', .56]]) for (const [name, y] of [['Shoulder', .25], ['Hip', .48], ['Knee', .68], ['Ankle', .88]]) joints[side + name] = { x, y: y - rise, confidence: .99 };
    const pose = { version: 1, sessionId, source, seq: s.samples.length, tMs: (s.samples.length + 1) * 40,
      modelId: 'synthetic-jump/1', coordinateSpace: 'image-normalized-unmirrored', image: { width: 640, height: 480 }, joints };
    s.samples.push({ pose, observed: r.update(pose), resultDelayMs: 0 });
  };
  for (let i = 0; i < 45; i++) add(0);
  for (let rep = 0; rep < 3; rep++) for (const ratio of [0, .25, .7, 1, 1, .7, .25, 0, 0, 0, 0, 0, 0, 0]) add(.14 * ratio);
  s.test.expectedCount = 2;
  const { outputs, report } = replaySession(s);
  assert.equal(report.status, 'PASS');
  assert.equal(outputs[44].stage, 'maximum');
  assert.ok(outputs.at(-1).calibrated);
  assert.deepEqual(outputs.map(a => [a.phase, a.heightRatio]), s.samples.map(a => [a.observed.phase, a.observed.heightRatio]));
});
