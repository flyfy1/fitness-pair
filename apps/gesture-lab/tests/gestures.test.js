import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertActionFrame } from '@fitness-pair/contracts';
import { GESTURES, GestureActions, consumeAction, initialState } from '../src/gestures.js';
const session = { sessionId: 'test', source: { kind: 'synthetic', id: 'fixture' } };
function harness() {
  let tMs = 0, seq = 0;
  const recognizer = new GestureActions(session);
  let state = initialState(session);
  const feed = (category = 'Thumb_Up', { x = .5, y = .7, score = .95, dt = 100, side = 'Right', count = 1 } = {}) => {
    tMs += dt;
    const hand = { side, category, score, joints: { wrist: { x, y }, middleMcp: { x, y: y - .15 } } };
    const frame = { ...session, seq: ++seq, tMs, image: { width: 640, height: 480 }, hands: category === null ? [] : Array.from({ length: count }, () => hand) };
    const action = recognizer.update(frame); assertActionFrame(action);
    state = consumeAction(state, action);
    return { action, frame };
  };
  return { feed, recognizer, get state() { return state; } };
}
test('catalog contains exactly seven model gestures plus an experimental wave', () => {
  assert.equal(GESTURES.length, 8); assert.equal(GESTURES.filter(g => g.experimental).length, 1);
  assert.deepEqual(GESTURES.filter(g => g.command).map(g => [g.id, g.command]), [['Thumb_Up', 'Confirm'], ['Wave', 'No']]);
});
test('held thumbs up confirms once; neutral release rearms with a unique completion ID', () => {
  const h = harness(); for (let i = 0; i < 20; i++) h.feed();
  assert.equal(h.state.confirm, 1);
  for (let i = 0; i < 6; i++) h.feed(null);
  for (let i = 0; i < 8; i++) h.feed();
  assert.equal(h.state.confirm, 2); assert.equal(new Set(h.state.ids).size, 2);
});
test('low confidence, brief thumb, two hands and interruptions never confirm', () => {
  const h = harness();
  for (let i = 0; i < 8; i++) h.feed('Thumb_Up', { score: .59 });
  for (let i = 0; i < 3; i++) h.feed();
  h.feed(null);
  for (let i = 0; i < 8; i++) h.feed('Thumb_Up', { count: 2 });
  for (let i = 0; i < 8; i++) h.feed('Thumb_Up', { dt: 300 });
  assert.equal(h.state.confirm, 0);
});
test('a horizontal three-leg open-palm wave triggers No once, in either direction', () => {
  for (const sign of [-1, 1]) {
    const h = harness();
    for (const x of [0, .1, .2, .1, 0, .1, .2, .1, 0, .1, .2]) h.feed('Open_Palm', { x: .4 + sign * x });
    assert.equal(h.state.no, 1); assert.equal(h.state.confirm, 0);
  }
});
test('static palm, one-way movement, tiny jitter and vertical movement never trigger No', () => {
  for (const sample of [i => ({ x: .5 }), i => ({ x: .2 + i * .02 }),
    i => ({ x: .5 + (i % 2) * .01 }), i => ({ x: .5, y: .4 + (i % 4) * .05 })]) {
    const h = harness(); for (let i = 0; i < 20; i++) h.feed('Open_Palm', sample(i));
    assert.equal(h.state.no, 0);
  }
});
test('wave resets on loss, low confidence, changed hand and expired window', () => {
  for (const interruption of [{ category: null }, { score: .2 }, { side: 'Left' }, { dt: 1900 }]) {
    const h = harness(); h.feed('Open_Palm', { x: .3 }); h.feed('Open_Palm', { x: .5 });
    h.feed(interruption.category === null ? null : 'Open_Palm', { x: .3, ...interruption });
    h.feed('Open_Palm', { x: .5 });
    assert.equal(h.state.no, 0);
  }
});
test('other static gestures are recognized without triggering Confirm or No', () => {
  for (const g of GESTURES.filter(g => !g.command)) {
    const h = harness(); let last;
    for (let i = 0; i < 8; i++) last = h.feed(g.id);
    assert.equal(last.action.action, g.id); assert.equal(h.state.confirm, 0); assert.equal(h.state.no, 0);
  }
});
test('foreign, duplicate and stale inputs cannot create actions or score', () => {
  const h = harness(); let last;
  for (let i = 0; i < 6; i++) last = h.feed();
  const { frame, action } = last;
  assert.equal(h.recognizer.update(frame), null);
  assert.equal(h.recognizer.update({ ...frame, seq: frame.seq + 1, tMs: frame.tMs + 1, sessionId: 'foreign' }), null);
  assert.equal(consumeAction(h.state, action), h.state);
  const duplicate = consumeAction(h.state, { ...action, inputSeq: 99, tMs: 9999 });
  assert.equal(duplicate.confirm, 1);
  const progressOnly = consumeAction(initialState(session), { ...action, completion: null });
  assert.equal(progressOnly.confirm, 0);
});
