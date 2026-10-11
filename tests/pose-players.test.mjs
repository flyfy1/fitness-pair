import test from 'node:test';
import assert from 'node:assert/strict';
import {assignPoseLanes} from '../packages/pose-mediapipe/players.js';
const sessions = ['left', 'right'].map(sessionId => ({sessionId, source: {kind: 'synthetic', id: 'lanes'}}));
const input = {seq: 3, tMs: 123, image: {width: 640, height: 480}};
const person = (x, confidence = .99) => ({joints: {leftShoulder: {x: x - .06, confidence}, rightShoulder: {x: x + .06, confidence}}});
test('ambiguous lanes and center-straddling shoulders emit missing poses instead of selecting another player', () => {
  assert.deepEqual(assignPoseLanes([person(.75), person(.8), person(.5)], sessions, input).map(frame => frame.joints), [{}, {}]);
  assert.deepEqual(assignPoseLanes([person(.75, null), person(.25, .2)], sessions, input).map(frame => frame.joints), [{}, {}]);
  const result = assignPoseLanes([person(.25)], sessions, input);
  assert.deepEqual(result[0].joints, {}); assert.equal(result[1].joints.leftShoulder.x, .19);
  assert.equal(result[1].tMs, 123); assert.equal(result[1].sessionId, 'right');
});
