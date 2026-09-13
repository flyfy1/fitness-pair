import test from 'node:test';
import assert from 'node:assert/strict';
import {BodyArcadeRecognizer} from '../experiments/action-recognition/body-arcade/index.js';
import {assertActionFrame} from '../contracts/index.js';
import {createBodyInput} from '../apps/integ-ar/src/input.js';
const session = {sessionId: 'body-test', source: {kind: 'synthetic', id: 'named-torso'}};
function harness(options = {}) {
  const recognizer = new BodyArcadeRecognizer(options); recognizer.reset(session); let seq = 0;
  const frame = ({x = 0, left = .6, right = .6, missing, gap = 50} = {}) => {
    const joints = {};
    for (const [side, base] of [['left', .44], ['right', .56]]) {
      joints[side + 'Shoulder'] = {x: base + x, y: .28, confidence: .99};
      joints[side + 'Hip'] = {x: base + x, y: .52, confidence: .99};
      joints[side + 'Wrist'] = {x: base + x, y: side === 'left' ? left : right, confidence: .99};
    }
    if (missing) delete joints[missing];
    const pose = {version: 1, ...session, seq: ++seq, tMs: (recognizer.lastTMs < 0 ? 0 : recognizer.lastTMs) + gap,
      modelId: 'synthetic-pose', coordinateSpace: 'image-normalized-unmirrored', image: {width: 640, height: 480}, joints};
    const action = recognizer.update(pose); if (action) assertActionFrame(action); return {pose, action};
  };
  const hold = (options, count = 25) => Array.from({length: count}, () => frame(options).action);
  return {recognizer, frame, hold};
}
test('body calibration, mirrored horizontal mapping and one completed raise preserve the v1 envelope', () => {
  const h = harness(); const setup = h.hold({});
  assert.equal(setup[0].phase, 'calibrating'); assert.equal(setup[0].progress, 0);
  h.hold({});
  assert(h.hold({x: .05}, 8).at(-1).controls.horizontal < -.2);
  const events = h.hold({left: .12}, 30).filter(a => a.completion);
  assert.equal(events.length, 1); assert.equal(events[0].source.kind, 'synthetic');
  h.hold({}, 7); const next = h.hold({left: .12}, 6).find(a => a.completion);
  assert(next); assert.notEqual(next.completion.id, events[0].completion.id);
  h.recognizer.recalibrate(); h.hold({}, 35);
  const recalibrated = h.hold({left: .12}, 8).find(a => a.completion);
  assert(recalibrated.completion.repIndex > next.completion.repIndex);
});
test('missing wrists, brief spikes, gaps and both-hand pause gestures never produce primary actions', () => {
  const h = harness({aiming: true}); h.hold({}, 35);
  assert.equal(h.frame({left: .12}).action.completion, null);
  assert.equal(h.frame({}).action.completion, null);
  assert(h.hold({left: .12, right: .12}).every(a => !a.completion));
  h.hold({}, 8); h.frame({left: .12});
  assert.equal(h.frame({missing: 'leftWrist'}).action.phase, 'missing');
  assert(h.hold({left: .12}).every(a => !a.completion));
  h.hold({}, 8); h.frame({left: .12});
  assert.equal(h.frame({left: .12, gap: 400}).action.completion, null);
  assert(h.hold({left: .12}).every(a => !a.completion));
  assert.equal(h.frame({missing: 'rightWrist'}).action.phase, 'missing');
});
test('aiming at the highest bubble targets keeps the right hand below the pause threshold', () => {
  const h = harness({aiming: true}); h.hold({}, 35);
  const event = h.hold({right: .36, left: .12}, 8).find(frame => frame.completion);
  assert(event); assert.equal(event.controls.aim.y, 0);
  assert.equal(event.controls.rightRaised, false);
});
test('game input deduplicates completions and rejects stale, foreign and uncalibrated actions', () => {
  const h = harness(); h.hold({}, 35);
  const event = h.hold({left: .12}, 6).find(a => a.completion);
  const commands = [], feed = createBodyInput(session, {input: c => commands.push(c)});
  assert(feed(event)); assert.equal(commands[0].primary, true);
  assert.equal(feed(event), false);
  assert(feed({...event, inputSeq: event.inputSeq + 1, tMs: event.tMs + 50}));
  assert.equal(commands[1].primary, false);
  assert.equal(feed({...event, sessionId: 'foreign', inputSeq: 1000, tMs: 9999}), false);
  assert.equal(feed({...event, inputSeq: 1000, tMs: 9999, controls: {horizontal: Infinity}}), false);
  const duplicate = h.frame({}).pose;
  assert.equal(h.recognizer.update(duplicate), null);
});
