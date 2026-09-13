import test from 'node:test';
import assert from 'node:assert/strict';
import { SquatDetector, kneeAngle, poseFeatures } from '../packages/action-squat/detector.js';

const standing = { angle: 175, hip: .45, torso: .2 };
const crouching = { angle: 120, hip: .53, torso: .2 };
function session() {
  const detector = new SquatDetector(); let time = 0; const events = [];
  return { detector, events,
    feed(feature, frames = 1, dt = 80) {
      let result;
      for (let i = 0; i < frames; i++) { time += dt; result = detector.updateFeatures(feature, time); if (result.rep) events.push(time); }
      return result;
    },
  };
}
test('complete stand → squat → stand counts once, and holding a pose never repeats', () => {
  const s = session(); s.feed(standing, 30); s.feed(crouching, 25);
  assert.equal(s.events.length, 0);
  s.feed(standing, 25); assert.equal(s.events.length, 1);
  s.feed(standing, 80); assert.equal(s.events.length, 1);
  s.feed(crouching, 12); s.feed(standing, 12); assert.equal(s.events.length, 2);
});
test('standing jitter, a single-frame squat, and hip-only bobbing do not attack', () => {
  const s = session(); s.feed(standing, 30);
  for (let i = 0; i < 100; i++) s.feed({ ...standing, angle: 167 + 5 * Math.sin(i), hip: .45 + .004 * Math.cos(i) });
  s.feed(crouching); s.feed(standing, 12);
  s.feed({ ...standing, hip: .54 }, 12); s.feed(standing, 12);
  assert.equal(s.events.length, 0);
});
test('brief occlusion preserves a confirmed squat but cannot complete an unconfirmed hold', () => {
  const s = session(); s.feed(standing, 30); s.feed(crouching, 12); s.feed(null, 2);
  s.feed(standing, 12); assert.equal(s.events.length, 1);
  s.feed(crouching, 1); s.feed(null, 2); s.feed(standing, 12); assert.equal(s.events.length, 1);
});
test('long loss cancels the partial rep and recalibrates at a new position', () => {
  const s = session(); s.feed(standing, 30); s.feed(crouching, 12); s.feed(null, 20);
  const relocated = { ...standing, hip: .5 };
  assert.equal(s.feed(relocated, 30).state, 'ready'); assert.equal(s.events.length, 0);
  s.feed({ ...crouching, hip: .58 }, 12); s.feed(relocated, 12); assert.equal(s.events.length, 1);
});
test('long time gap also cancels partial rep, even without explicit missing frames', () => {
  const s = session(); s.feed(standing, 30); s.feed(crouching, 12); s.feed(standing, 1, 2000);
  s.feed(standing, 25); assert.equal(s.events.length, 0);
});
test('starting crouched requires standing calibration', () => {
  const s = session(); assert.equal(s.feed(crouching, 30).state, 'stand');
  assert.equal(s.detector.baseline, null); assert.equal(s.feed(standing, 35).state, 'ready');
  assert.equal(s.events.length, 0);
});
test('reset discards in-progress squat and calibration', () => {
  const s = session(); s.feed(standing, 30); s.feed(crouching, 12); s.detector.reset();
  s.feed(standing, 30); assert.equal(s.events.length, 0);
});
test('knee angles correct for video aspect ratio', () => {
  const a = { x: .2, y: .2 }, b = { x: .5, y: .5 }, c = { x: .8, y: .2 };
  assert.ok(Math.abs(kneeAngle(a, b, c, 1) - 90) < 1e-7);
  const compressedX = p => ({ x: p.x / 2, y: p.y });
  assert.ok(Math.abs(kneeAngle(compressedX(a), compressedX(b), compressedX(c), 2) - 90) < 1e-7);
});
test('missing, out of frame, and low confidence joints are rejected', () => {
  assert.equal(poseFeatures({}), null);
  const points = {};
  for (const side of ['left', 'right']) {
    for (const [joint, y] of [['Shoulder', .2], ['Hip', .45], ['Knee', .65], ['Ankle', .9]]) {
      points[`${side}${joint}`] = { x: .5, y, confidence: 1 };
    }
  }
  assert.ok(poseFeatures(points));
  points.leftAnkle.confidence = .2; points.rightAnkle.y = 1.1;
  assert.equal(poseFeatures(points), null);
});
