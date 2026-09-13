import test from 'node:test';
import assert from 'node:assert/strict';
import { assertActionFrame } from '@fitness-pair/contracts';
import { JumpHeightRecognizer } from '../index.js';

// Artificial, named 2D geometry. These fixtures are not participant evidence.
const session = { sessionId: 'synthetic-jump-session', source: { kind: 'synthetic', id: 'jump-height-geometry/1' } };
function harness() {
  const recognizer = new JumpHeightRecognizer();
  recognizer.reset(session);
  let seq = 0, tMs = 0;
  const pose = (rise = 0, modify = () => {}, dt = 40) => {
    const joints = {};
    for (const [side, x] of [['left', .44], ['right', .56]]) {
      for (const [name, y] of [['Shoulder', .25], ['Hip', .48], ['Knee', .68], ['Ankle', .88]]) {
        joints[`${side}${name}`] = { x, y: y - rise, confidence: .99 };
      }
    }
    const frame = { version: 1, ...session, seq: seq++, tMs: tMs += dt,
      modelId: 'synthetic-joints/1', coordinateSpace: 'image-normalized-unmirrored',
      image: { width: 640, height: 480 }, joints };
    modify(frame);
    return frame;
  };
  const update = (...args) => {
    const output = recognizer.update(pose(...args));
    if (output) assertActionFrame(output);
    return output;
  };
  const hold = (count = 45, rise = 0, modify) => Array.from({ length: count }, () => update(rise, modify));
  const jump = (height = .14) => [0, .25, .7, 1, 1, .7, .25, 0, 0, 0, 0, 0, 0, 0].map(ratio => update(height * ratio));
  const calibrate = () => {
    assert.equal(hold().at(-1).stage, 'maximum');
    const frames = jump();
    assert.equal(frames.at(-1).stage, 'ready');
    return frames;
  };
  return { recognizer, pose, update, hold, jump, calibrate };
}

test('standing and maximum calibration never charge or emit completion', () => {
  const h = harness();
  const standing = h.hold();
  assert.equal(standing[0].stage, 'standing');
  assert.equal(standing.at(-1).cue, 'jump-maximum');
  const jump = h.jump();
  assert.ok(jump.some(frame => frame.cue === 'land-and-hold'));
  for (const frame of [...standing, ...jump]) {
    assert.equal(frame.progress, 0); assert.equal(frame.heightRatio, 0); assert.equal(frame.completion, null);
  }
  assert.equal(jump.at(-1).calibrated, true);
  assert.ok(jump.at(-1).peakRise > .13 && jump.at(-1).peakRise <= .14);
});

test('live 25%, 50%, and 100% jumps rise and fall proportionally, larger jumps clamp', () => {
  const h = harness(); h.calibrate();
  for (const scale of [.25, .5, 1, 1.4]) {
    const frames = h.jump(.14 * scale);
    const max = Math.max(...frames.map(frame => frame.heightRatio));
    assert.ok(Math.abs(max - Math.min(1, scale)) < .015, `${scale} -> ${max}`);
    assert.ok(frames[6].heightRatio < frames[4].heightRatio, 'follows descent before landing');
    assert.equal(frames.at(-1).heightRatio, 0);
    assert.equal(frames.filter(frame => frame.completion).length, 1);
  }
  assert.equal(h.recognizer.repIndex, 4);
});

test('grounded jitter, squats, knee tucks and one foot lifts do not control a jump', () => {
  const h = harness(); h.calibrate();
  const frames = h.hold(20, .002);
  frames.push(...h.hold(12, 0, frame => {
    for (const side of ['left', 'right']) {
      frame.joints[`${side}Hip`].y += .12;
      frame.joints[`${side}Shoulder`].y += .12;
      frame.joints[`${side}Knee`].x += .1;
    }
  }));
  frames.push(...h.hold(12, 0, frame => { frame.joints.leftAnkle.y -= .15; }));
  frames.push(...h.hold(12, 0, frame => {
    frame.joints.leftAnkle.y -= .15; frame.joints.rightAnkle.y -= .15;
  }));
  assert.ok(frames.every(frame => frame.heightRatio === 0 && frame.completion === null));
});

test('tucked feet cannot amplify torso height', () => {
  const h = harness(); h.calibrate();
  const frames = h.hold(5, .07, frame => {
    frame.joints.leftAnkle.y -= .08; frame.joints.rightAnkle.y -= .08;
  });
  const ratio = frames.at(-1).heightRatio;
  assert.ok(ratio > .45 && ratio < .55);
});

test('cropped, low confidence and missing joints produce zero output', () => {
  for (const modify of [frame => { frame.joints = {}; },
    frame => { frame.joints.rightAnkle.y = 1.03; },
    frame => { frame.joints.leftHip.confidence = null; },
    frame => { frame.joints.rightShoulder.confidence = .4; }]) {
    const h = harness(); h.calibrate(); h.update(.07);
    const missing = h.update(0, modify);
    assert.equal(missing.phase, 'missing'); assert.equal(missing.heightRatio, 0);
    assert.equal(missing.calibrated, true, 'short loss preserves calibration');
    assert.ok(h.hold(10).every(frame => frame.completion === null), 'lost landing never counts');
    assert.equal(h.jump().filter(frame => frame.completion).length, 1);
  }
});

test('long loss and gaps without input invalidate calibration', () => {
  const h = harness(); h.calibrate();
  const lost = h.hold(25, 0, frame => { frame.joints = {}; });
  assert.equal(lost.at(-1).calibrated, false); assert.equal(lost.at(-1).stage, 'standing');
  h.calibrate();
  const gap = h.update(0, undefined, 1000);
  assert.equal(gap.stage, 'standing'); assert.equal(gap.peakRise, null);
});

test('short losses reset standing stability instead of crediting unseen time', () => {
  const h = harness(); h.hold(30);
  h.update(0, frame => { frame.joints = {}; });
  assert.equal(h.hold(20).at(-1).stage, 'standing');
  assert.equal(h.hold(20).at(-1).stage, 'maximum');
});

test('short-loss recovery remains missing until grounded rather than resuming in midair', () => {
  const h = harness(); h.calibrate();
  h.update(.07);
  h.update(0, frame => { frame.joints = {}; });
  const airborne = h.hold(5, .07);
  assert.ok(airborne.every(frame => frame.phase === 'missing' && frame.calibrated && frame.heightRatio === 0));
  const landing = h.hold(8);
  assert.equal(landing[0].phase, 'missing');
  assert.equal(landing.at(-1).phase, 'ready');
  assert.ok(landing.every(frame => frame.completion === null));
});

test('upward camera reposition during a short loss cannot leave recovery stuck', () => {
  const h = harness(); h.calibrate();
  h.update(0, frame => { frame.joints = {}; });
  const shifted = h.hold(68, .08);
  assert.ok(shifted.some(frame => frame.cue === 'rebaseline'));
  assert.equal(shifted.at(-1).stage, 'standing');
});

test('duplicate and stale input are ignored; session, source and model switches require reset', () => {
  const h = harness(); const first = h.pose(); h.recognizer.update(first);
  assert.equal(h.recognizer.update(first), null);
  assert.equal(h.recognizer.update({ ...first, seq: 10, tMs: 0 }), null);
  for (const changed of [frame => { frame.sessionId = 'foreign'; },
    frame => { frame.source = { kind: 'replay', id: 'foreign' }; },
    frame => { frame.modelId = 'other-model'; }]) {
    assert.throws(() => h.recognizer.update(h.pose(0, changed)), /session|source|Model/);
  }
  const source = { kind: 'replay', id: 'local-replay' };
  h.recognizer.reset({ sessionId: 'replay-session', source });
  const input = h.pose(0, frame => { frame.source = source; frame.sessionId = 'replay-session'; });
  const output = h.recognizer.update(input);
  assert.deepEqual(output.source, source); assert.equal(output.tMs, input.tMs); assert.equal(output.inputSeq, input.seq);
});

test('recalibration does not reuse completion IDs', () => {
  const h = harness(); h.calibrate();
  const first = h.jump().find(frame => frame.completion).completion;
  h.recognizer.recalibrate(); h.calibrate();
  const second = h.jump().find(frame => frame.completion).completion;
  assert.equal(second.repIndex, first.repIndex + 1); assert.notEqual(first.id, second.id);
});

test('a small maximum jump retries without division by noise', () => {
  const h = harness(); h.hold();
  const rejected = h.jump(.016);
  assert.equal(rejected.at(-1).cue, 'jump-higher-and-retry');
  assert.equal(rejected.at(-1).peakRise, null); assert.equal(rejected.at(-1).calibrated, false);
  assert.equal(h.jump(.14).at(-1).calibrated, true);
});

test('maximum calibration wait and impossible sustained flight are bounded', () => {
  const h = harness(); h.hold();
  const waited = h.hold(400);
  assert.ok(waited.some(frame => frame.quality === 'calibration-timeout'));
  const h2 = harness(); h2.calibrate();
  const flight = h2.hold(68, .14);
  assert.ok(flight.some(frame => frame.cue === 'rebaseline'));
  assert.equal(flight.at(-1).calibrated, false);
});

test('sustained scale/position drift and changed dimensions rebaseline', () => {
  for (const modify of [frame => { for (const joint of Object.values(frame.joints)) joint.x += .15; },
    frame => { frame.joints.leftShoulder.y -= .08; frame.joints.rightShoulder.y -= .08; },
    frame => { for (const joint of Object.values(frame.joints)) joint.y += .05; }]) {
    const h = harness(); h.calibrate();
    const changed = h.hold(12, 0, modify);
    assert.equal(changed[0].phase, 'missing');
    assert.equal(changed.at(-1).calibrated, false);
  }
  const h = harness(); h.calibrate();
  assert.equal(h.update(0, frame => { frame.image.width = 1280; }).stage, 'standing');
});

test('crouched or moving stance cannot calibrate standing', () => {
  const h = harness();
  const crouched = h.hold(50, 0, frame => {
    for (const side of ['left', 'right']) {
      frame.joints[`${side}Knee`].x += .15;
      frame.joints[`${side}Hip`].y += .1;
      frame.joints[`${side}Shoulder`].y += .1;
    }
  });
  assert.ok(crouched.every(frame => frame.stage === 'standing'));
  for (let i = 0; i < 50; i++) assert.equal(h.update(i % 2 ? .02 : 0).stage, 'standing');
});
