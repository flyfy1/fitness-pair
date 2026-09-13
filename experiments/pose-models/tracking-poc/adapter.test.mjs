import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPoseFrame } from '../../../contracts/index.js';
import { adaptResult, pinchRatio, usable } from './adapter.js';
const meta = { sessionId: 'fixture', seq: 1, tMs: 123, source: { kind: 'synthetic', id: 'adapter-test' }, width: 1280, height: 720 };
test('body modes preserve the shared contract, input provenance and unmirrored x', () => {
  const result = { landmarks: [Array.from({ length: 33 }, () => ({ x: .2, y: .4, visibility: .9 }))] };
  for (const mode of ['full', 'upper']) {
    const frame = adaptResult(result, meta, mode); assertPoseFrame(frame);
    assert.equal(frame.tMs, 123); assert.deepEqual(frame.source, meta.source);
    assert.equal(frame.joints.leftWrist.x, .2);
    assert.equal(Object.keys(frame.joints).length, mode === 'upper' ? 6 : 12);
    if (mode === 'upper') assert.equal(frame.joints.leftHip, undefined);
  }
  assert.deepEqual(adaptResult({ landmarks: [] }, meta, 'upper').joints, {});
});
test('hand points remain named with unknown confidence and a separate side score', () => {
  const frame = adaptResult({ landmarks: [[{ x: .1, y: .2 }, { x: NaN, y: 0 }]], handedness: [[{ categoryName: 'Right', score: .98 }]] }, meta, 'hands');
  assert.deepEqual(frame.hands[0].joints, { wrist: { x: .1, y: .2, confidence: null } });
  assert.equal(frame.hands[0].sideConfidence, .98); assert.equal(frame.tMs, meta.tMs);
  assert.deepEqual(adaptResult({ landmarks: [] }, meta, 'hands').hands, []);
});
test('pinch ratio accounts for image aspect and rejects missing or unusable geometry', () => {
  const point = (x,y) => ({ x,y,confidence: null });
  const joints = { indexMCP: point(.4,.5), pinkyMCP: point(.6,.5), thumbTip: point(.5,.2), indexTip: point(.5,.3) };
  assert.ok(Math.abs(pinchRatio(joints, { width: 1000, height: 500 }) - .25) < 1e-8);
  assert.equal(pinchRatio({}, meta), null);
  assert.equal(usable(point(1.2,.5)), false); assert.equal(usable({ x:.5,y:.5,confidence:.1 }),false);
});
