import test from 'node:test';
import assert from 'node:assert/strict';
import { BodyGestures } from '../../../packages/gameplay/body-gestures.js';
const session = { sessionId: 'synthetic-ui', source: { kind: 'synthetic', id: 'gesture-test' } };
function fixture(options) {
  const g = new BodyGestures(options); g.reset(session); let seq = 0, tMs = 0;
  const frame = (kind = 'neutral', dt = 50) => ({ ...session, seq: seq++, tMs: tMs += dt, joints: kind === 'missing' ? {} : {
    leftShoulder: { x: .4, y: .4, confidence: .99 }, rightShoulder: { x: .6, y: .4, confidence: .99 },
    leftWrist: { x: .3, y: kind === 'one-hand' || kind === 'both-hands' ? .15 : .65, confidence: .99 },
    rightWrist: { x: .7, y: kind === 'right-hand' || kind === 'both-hands' ? .15 : .65, confidence: .99 },
  } });
  const hold = (kind, n = 25) => Array.from({ length: n }, () => g.update(frame(kind)));
  return { g, frame, hold };
}
test('left-only confirmation rejects right holds and keeps both-hand commands', () => {
  const { hold } = fixture({ oneHandSide: 'left' });
  assert.equal(hold('right-hand', 30).some(v => v.event), false);
  assert.equal(hold('one-hand', 15).some(v => v.event), false);
  assert.equal(hold('one-hand', 10).filter(v => v.event).length, 1);
  assert.equal(hold('one-hand', 30).some(v => v.event), false);
  hold('neutral', 10);
  assert.equal(hold('both-hands').filter(v => v.event).length, 1);
  assert.equal(fixture().hold('right-hand').filter(v => v.event).length, 1);
});
test('holds emit one UI event with source and sequence; continued holding never toggles twice', () => {
  const { hold } = fixture();
  const values = hold('both-hands', 100), events = values.filter(v => v.event);
  assert.equal(events.length, 1); assert.equal(events[0].event.kind, 'both-hands');
  assert.deepEqual(events[0].event.source, session.source); assert.ok(events[0].event.id);
  hold('neutral', 10); assert.equal(hold('both-hands').filter(v => v.event).length, 1);
});
test('a brief jump arm swing, missing wrists and input gaps cannot complete a gesture', () => {
  const { g, frame, hold } = fixture();
  assert.equal(hold('both-hands', 8).some(v => v.event), false);
  hold('neutral', 2); hold('one-hand', 15); hold('missing', 1);
  assert.equal(hold('one-hand', 15).some(v => v.event), false);
  assert.equal(g.update(frame('one-hand', 500)).event, null);
  assert.equal(hold('one-hand', 15).some(v => v.event), false);
});
test('missing wrists cannot rearm a held command; stale and foreign frames are rejected', () => {
  const { g, frame, hold } = fixture();
  hold('one-hand'); hold('missing', 20);
  assert.equal(hold('one-hand', 30).some(v => v.event), false);
  const f = frame(); g.update(f); assert.equal(g.update(f), null);
  assert.equal(g.update({ ...frame(), sessionId: 'foreign' }), null);
  hold('neutral', 10); assert.equal(hold('one-hand').filter(v => v.event).length, 1);
});
