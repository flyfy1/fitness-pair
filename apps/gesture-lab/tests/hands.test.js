import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandControls } from '../src/hands.js';
import { ratingHand } from './fixtures/rating-hand.js';
const session = { sessionId: 'dual', source: { kind: 'synthetic', id: 'dual' } };
const left = () => ratingHand(2, { mirror: true, xOffset: -.22 });
const right = () => ratingHand(5, { xOffset: .22 });
function harness(mode = 'ratings') {
  const controls = new HandControls(session, { mode }); let seq = 0;
  return { controls, feed(hands) {
    return controls.update({ ...session, seq: ++seq, tMs: seq * 100, image: { width: 640, height: 480 }, hands });
  } };
}
test('two simultaneous ratings have independent values and unique completion IDs', () => {
  const h = harness(); let result;
  for (let i = 0; i < 15; i++) result = h.feed(i % 2 ? [left(), right()] : [right(), left()]);
  assert.deepEqual(result.state.ratings, { Left: 2, Right: 5 });
  assert.equal(result.state.ratingCount, 2);
  assert.equal(new Set(result.state.history.map(item => item.id)).size, 2);
  assert.deepEqual(new Set(result.state.history.map(item => item.hand)), new Set(['Left', 'Right']));
});
test('one hand can leave and rearm without retriggering the other held hand', () => {
  const h = harness();
  for (let i = 0; i < 9; i++) h.feed([left(), right()]);
  for (let i = 0; i < 5; i++) h.feed([right()]);
  for (let i = 0; i < 9; i++) h.feed([left(), right()]);
  assert.equal(h.controls.snapshot().ratingCount, 3);
  assert.equal(h.controls.snapshot().history.filter(item => item.hand === 'Right').length, 1);
});
test('overlap and duplicate side labels pause without rearming held actions', () => {
  const h = harness();
  for (let i = 0; i < 9; i++) h.feed([left(), right()]);
  for (let i = 0; i < 6; i++) assert.equal(h.feed([left(), { ...right(), side: 'Left' }]).ambiguous, true);
  for (let i = 0; i < 9; i++) h.feed([left(), right()]);
  assert.equal(h.controls.snapshot().ratingCount, 2);
  const fresh = harness();
  for (let i = 0; i < 12; i++) fresh.feed([ratingHand(2, { mirror: true }), ratingHand(5)]);
  assert.equal(fresh.controls.snapshot().ratingCount, 0);
});
test('simultaneous thumbs up are consumed once per hand, not dropped as duplicate frames', () => {
  const h = harness('controls');
  const hands = [left(), right()].map(hand => ({ ...hand, category: 'Thumb_Up', score: .95 }));
  for (let i = 0; i < 20; i++) h.feed(hands);
  assert.equal(h.controls.snapshot().confirm, 2);
});
