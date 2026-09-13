import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPoseFrame, assertActionFrame, assertEvaluationResult } from '@fitness-pair/contracts';
import { SquatRecognizer } from '@fitness-pair/action-squat';
import { createGameState, consumeAction } from '@fitness-pair/game-forest';
import { fromMediaPipe } from '@fitness-pair/pose-mediapipe';
import { squatSession } from '../contracts/fixtures/squat-session.js';

function recognize() {
  const frames = squatSession(), recognizer = new SquatRecognizer(); recognizer.reset(frames[0]);
  return frames.map(f => recognizer.update(f));
}
test('named pose → recognizer → game completes exactly five synthetic reps', () => {
  const actions = recognize(); let state = createGameState(actions[0]);
  for (const frame of actions) { assertActionFrame(frame); state = consumeAction(state, frame).state; }
  assert.equal(state.completedReps, 5); assert.equal(state.health, 0); assert.equal(state.finished, true);
  assert.equal(state.source.kind, 'synthetic');
});
test('calibration cannot charge a game; explicit events are required to score', () => {
  const actions = recognize();
  for (const frame of actions.filter(f => f.phase === 'calibrating')) assert.equal(frame.progress, 0);
  const active = actions.find(f => f.phase === 'active');
  const state = consumeAction(createGameState(active), { ...active, progress: 1 }).state;
  assert.equal(state.completedReps, 0);
  assert.throws(() => assertActionFrame({ ...active, phase: 'calibrating', progress: 1 }));
});
test('completion re-delivery, stale data, and foreign source/session never score twice', () => {
  const completion = recognize().find(f => f.completion);
  let state = consumeAction(createGameState(completion), completion).state;
  for (const frame of [completion, { ...completion, inputSeq: completion.inputSeq + 1, tMs: completion.tMs + 80 },
    { ...completion, sessionId: 'other-session' }, { ...completion, source: { kind: 'camera', id: 'other' } }]) {
    state = consumeAction(state, frame).state;
  }
  assert.equal(state.completedReps, 1);
});
test('recalibration preserves completion IDs and stale input is ignored', () => {
  const frames = squatSession(1), recognizer = new SquatRecognizer(); recognizer.reset(frames[0]);
  const first = frames.map(f => recognizer.update(f)).find(f => f.completion);
  assert.equal(recognizer.update(frames.at(-1)), null);
  recognizer.recalibrate();
  const next = frames.map(f => ({ ...f, seq: f.seq + frames.length, tMs: f.tMs + frames.length * 80 }));
  const second = next.map(f => recognizer.update(f)).find(f => f.completion);
  assert.notEqual(first.completion.id, second.completion.id); assert.equal(second.completion.repIndex, 2);
  assert.throws(() => recognizer.update({ ...next.at(-1), seq: 999, tMs: 99_999, modelId: 'another-model' }));
});
test('provider maps missing joints and preserves unknown confidence without inventing points', () => {
  const meta = { sessionId: 's', seq: 0, tMs: 0, source: { kind: 'synthetic', id: 'f' }, width: 640, height: 480 };
  assert.deepEqual(fromMediaPipe({ ...meta, landmarks: [] }).joints, {});
  const landmarks = []; landmarks[11] = { x: -.1, y: .4 };
  const frame = fromMediaPipe({ ...meta, landmarks }); assertPoseFrame(frame);
  assert.equal(frame.joints.leftShoulder.confidence, null);
  assert.equal(frame.joints.leftShoulder.x, -.1);
  assert.throws(() => assertPoseFrame({ ...frame, coordinateSpace: 'mirrored' }));
  assert.throws(() => assertPoseFrame({ ...frame, tMs: NaN }));
});
test('missing annotation metrics stay null and invalid evidence is rejected', () => {
  const value = { version: 1, runId: 'test', fixtureId: 'synthetic', evidence: 'synthetic',
    modelId: 'none', recognizerId: 'test', device: 'node', expectedCount: 5, observedCount: 5,
    falseCompletions: null, missedCompletions: null, matchingWindowMs: null,
    timing: { metric: 'synthetic_event_delay_ms', p50Ms: null, p95Ms: null } };
  assertEvaluationResult(value);
  assert.throws(() => assertEvaluationResult({ ...value, observedCount: -1 }));
  assert.throws(() => assertEvaluationResult({ ...value, evidence: 'production-accuracy' }));
});
