import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRating } from '../src/ratings.js';
import { GestureActions, consumeAction, initialState } from '../src/gestures.js';
import { ratingHand } from './fixtures/rating-hand.js';
const image = { width: 640, height: 480 };
const session = { sessionId: 'ratings', source: { kind: 'synthetic', id: 'ratings' } };
function harness(mode = 'ratings') {
  const recognizer = new GestureActions(session, { mode }); let seq = 0, tMs = 0;
  let state = initialState(session);
  return { get state() { return state; }, feed(hand, dt = 100) {
    const action = recognizer.update({ ...session, seq: ++seq, tMs: tMs += dt, image, hands: hand ? [hand] : [] });
    state = consumeAction(state, action); return action;
  } };
}
test('all five documented patterns work with either hand and in-plane rotation', () => {
  for (let n = 1; n <= 5; n++) for (const mirror of [false, true]) for (const rotation of [0, -.5, .5]) {
    assert.equal(readRating(ratingHand(n, { mirror, rotation }), image), n);
  }
});
test('cropped, missing, collapsed and unsupported patterns do not invent ratings', () => {
  const missing = ratingHand(3); delete missing.joints.indexTip;
  assert.equal(readRating(missing, image), null);
  const cropped = ratingHand(3); cropped.joints.indexTip.x = 1.1;
  assert.equal(readRating(cropped, image), null);
  const collapsed = ratingHand(3); collapsed.joints.indexPip = collapsed.joints.indexMcp;
  assert.equal(readRating(collapsed, image), null);
  assert.equal(readRating(ratingHand(0), image), null);
  const thumb = ratingHand(0); thumb.joints.thumbIp = { x: .30, y: .57 }; thumb.joints.thumbTip = { x: .25, y: .52 };
  assert.equal(readRating(thumb, image), null);
  const love = ratingHand(5); const folded = ratingHand(0);
  for (const finger of ['middle', 'ring']) for (const part of ['Pip', 'Dip', 'Tip']) love.joints[finger + part] = folded.joints[finger + part];
  assert.equal(readRating(love, image), null);
});
test('rating hold emits once; release permits next value and event IDs are unique', () => {
  const h = harness();
  for (let n = 1; n <= 5; n++) {
    for (let i = 0; i < 12; i++) h.feed(ratingHand(n));
    assert.equal(h.state.rating, n); assert.equal(h.state.ratingCount, n);
    for (let i = 0; i < 5; i++) h.feed(null);
  }
  assert.equal(h.state.confirm, 0); assert.equal(h.state.no, 0);
  assert.equal(new Set(h.state.ids).size, 5);
});
test('changing numbers without a neutral release never submits another rating', () => {
  const h = harness(); for (let i = 0; i < 8; i++) h.feed(ratingHand(2));
  for (let i = 0; i < 20; i++) h.feed(ratingHand(5));
  assert.equal(h.state.rating, 2); assert.equal(h.state.ratingCount, 1);
});
test('brief holds, interrupted frames, and waving an open hand do not rate', () => {
  for (const scenario of ['brief', 'gap', 'moving']) {
    const h = harness();
    for (let i = 0; i < 30; i++) {
      h.feed(scenario === 'brief' && i % 6 === 0 ? null : ratingHand(5, { xOffset: scenario === 'moving' ? Math.sin(i * .5) * .15 : 0 }), scenario === 'gap' ? 300 : 100);
    }
    assert.equal(h.state.ratingCount, 0);
  }
});
test('controls mode never emits ratings even when number geometry is present', () => {
  const h = harness('controls');
  for (let n = 1; n <= 5; n++) for (let i = 0; i < 12; i++) h.feed(ratingHand(n));
  assert.equal(h.state.rating, null); assert.equal(h.state.ratingCount, 0);
});
