import test from 'node:test';
import assert from 'node:assert/strict';
import { assertActionFrame } from '@fitness-pair/contracts';
import { JumpHeightRecognizer } from '../index.js';

// Artificial, named 2D geometry. These fixtures are not participant evidence.
const session = { sessionId: 'synthetic-jump-session', source: { kind: 'synthetic', id: 'jump-height-geometry/1' } };

test('quick torso entry tolerates lateral joint-width noise while coherent rise still starts it', () => {
  const h = harness(frame => {
    // Synthetic 2D landmark jitter: widths change, torso length and height do not.
    frame.joints.leftShoulder.x += frame.seq % 2 ? .016 : 0;
    frame.joints.rightHip.x -= frame.seq % 2 ? .014 : 0;
    frame.joints.leftKnee.x += .08;
    frame.joints.rightKnee.x -= .08;
  }, { quickStart: true, preferUpperBody: true });
  assert.equal(h.hold(10).at(-1).cue, 'jump-to-start');
  assert.equal(h.hold(3,.025).at(-1).calibrated,true);
  assert.equal(h.hold(8).at(-1).heightRatio,0);
  const shrug=h.hold(5,0,frame=>{frame.joints.leftShoulder.y-=.02;frame.joints.rightShoulder.y-=.02;});
  assert.ok(shrug.every(f=>f.heightRatio===0));
});

test('quick start accepts a small coherent lift before landing, using body scale rather than jump peak', () => {
  for (const upper of [false, true]) {
    const h = harness(frame => { if (upper) for (const side of ['left','right']) {
      delete frame.joints[side+'Knee']; delete frame.joints[side+'Ankle'];
    } }, { quickStart: true });
    assert.equal(h.hold(8).at(-1).cue, 'jump-to-start');
    const lift = h.hold(3,.02);
    assert.equal(lift.at(-1).calibrated, true);
    assert.equal(lift.at(-1).phase, 'active');
    assert.ok(Math.abs(lift.at(-1).peakRise - .115) < .001);
    assert.equal(lift.at(-1).completion, null);
    const land = h.hold(8);
    assert.equal(land.filter(f=>f.completion).length,1);
    const id = land.find(f=>f.completion).completion.id;
    h.recognizer.recalibrate(); h.hold(8); h.hold(3,.02);
    const next = h.hold(8).find(f=>f.completion);
    assert.notEqual(next.completion.id,id);
  }
});

test('quick start ignores jitter, one-frame spikes, isolated foot lifts and missing poses', () => {
  const h = harness(()=>{}, { quickStart: true }); h.hold(8);
  assert.ok(h.hold(10,.005).every(f=>!f.calibrated));
  assert.equal(h.update(.02).calibrated,false);
  assert.ok(h.hold(8).every(f=>!f.calibrated));
  assert.ok(h.hold(5,0,frame=>{frame.joints.leftAnkle.y-=.1;}).every(f=>!f.calibrated));
  const missing=h.update(0,frame=>{frame.joints={};});
  assert.equal(missing.phase,'missing'); assert.equal(missing.calibrated,false);
  assert.equal(h.recognizer.update(h.pose(0,frame=>{frame.joints={};},800)).stage,'standing');
});
function harness(defaultModify = () => {}, options = {}) {
  const recognizer = new JumpHeightRecognizer(options);
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
    defaultModify(frame);
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


const cropLegs = frame => {
  for (const side of ['left', 'right']) {
    delete frame.joints[`${side}Knee`]; delete frame.joints[`${side}Ankle`];
  }
};

test('upper-body standing, maximum, and proportional rise/fall work without visible legs', () => {
  for (const modify of [cropLegs, frame => {
    frame.joints.leftAnkle.y = 1.1; frame.joints.rightAnkle.confidence = .1;
  }]) {
    const h = harness(modify);
    const calibration = h.calibrate();
    assert.ok(calibration.every(frame => frame.trackingMode === 'upper-body'));
    assert.ok(calibration.every(frame => frame.progress === 0 && frame.completion === null));
    for (const scale of [.25, .5, 1, 1.4]) {
      const frames = h.jump(.14 * scale);
      const max = Math.max(...frames.map(frame => frame.heightRatio));
      assert.ok(Math.abs(max - Math.min(1, scale)) < .015, `${scale} -> ${max}`);
      assert.ok(frames[6].heightRatio < frames[4].heightRatio);
      assert.equal(frames.at(-1).heightRatio, 0);
      assert.equal(frames.filter(frame => frame.completion).length, 1);
    }
  }
});

test('calibrated upper-body mode stays locked when legs become visible', () => {
  let cropped = true;
  const h = harness(frame => { if (cropped) cropLegs(frame); });
  h.calibrate();
  const peak = h.recognizer.peakRise;
  cropped = false;
  const frames = h.jump(.07);
  assert.ok(frames.every(frame => frame.trackingMode === 'upper-body' && frame.peakRise === peak));
  assert.equal(frames.filter(frame => frame.completion).length, 1);
  assert.ok(Math.abs(Math.max(...frames.map(frame => frame.heightRatio)) - .5) < .015);
});

test('full-body is preferred during initial standing when all joints are visible', () => {
  const h = harness();
  assert.equal(h.update().trackingMode, 'full-body');
  h.calibrate();
  assert.equal(h.recognizer.trackingMode, 'full-body');
});

test('stable cropped legs trigger new upper-body standing and maximum after bounded loss', () => {
  const h = harness(); h.calibrate();
  const first = h.jump().find(frame => frame.completion).completion;
  h.update(.07);
  const shortLoss = h.hold(18, 0, cropLegs);
  assert.ok(shortLoss.every(frame => frame.phase === 'missing' && frame.calibrated
    && frame.trackingMode === 'full-body' && frame.completion === null && frame.heightRatio === 0));
  const fallback = h.hold(3, 0, cropLegs).at(-1);
  assert.equal(fallback.trackingMode, 'upper-body');
  assert.equal(fallback.stage, 'standing'); assert.equal(fallback.peakRise, null);
  assert.equal(fallback.heightRatio, 0); assert.equal(fallback.completion, null);
  const standing = h.hold(45, 0, cropLegs);
  assert.equal(standing.at(-1).stage, 'maximum');
  assert.ok(standing.every(frame => !frame.calibrated && frame.completion === null));
  // Once the new upper-body baseline is established, reappearing legs do not
  // change the selected signal while maximum calibration or play is underway.
  assert.equal(h.jump().at(-1).trackingMode, 'upper-body');
  const second = h.jump().find(frame => frame.completion).completion;
  assert.equal(second.repIndex, first.repIndex + 1); assert.notEqual(second.id, first.id);
});

test('moving cropped torso cannot silently switch calibrated full-body mode', () => {
  const h = harness(); h.calibrate();
  for (let i = 0; i < 30; i++) {
    const output = h.update(i % 2 ? .03 : 0, cropLegs);
    assert.equal(output.phase, 'missing'); assert.equal(output.trackingMode, 'full-body');
    assert.equal(output.heightRatio, 0); assert.equal(output.completion, null);
  }
  assert.equal(h.recognizer.peakRise, null);
});

test('upper-body mode requires every shoulder and hip, including confidence and framing', () => {
  for (const name of ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip']) {
    for (const change of [joint => { joint.confidence = null; }, joint => { joint.confidence = .4; },
      joint => { joint.y = 1.1; }]) {
      const h = harness(cropLegs); h.calibrate(); h.update(.07);
      const lost = h.update(0, frame => change(frame.joints[name]));
      assert.equal(lost.phase, 'missing'); assert.equal(lost.heightRatio, 0);
      assert.equal(lost.completion, null);
      assert.ok(h.hold(8).every(frame => frame.completion === null));
    }
    const h = harness(cropLegs);
    assert.equal(h.update(0, frame => { delete frame.joints[name]; }).phase, 'missing');
  }
});

test('upper-body rejects shrug, bending, side movement and depth scale drift', () => {
  const modifications = [
    frame => { frame.joints.leftShoulder.y -= .02; frame.joints.rightShoulder.y -= .02; },
    frame => { frame.joints.leftHip.y -= .09; frame.joints.rightHip.y -= .09; },
    frame => { for (const joint of Object.values(frame.joints)) joint.x += .15; },
    frame => {
      for (const joint of Object.values(frame.joints)) {
        joint.x = .5 + (joint.x - .5) * 1.3;
        joint.y = .48 + (joint.y - .48) * 1.3;
      }
    },
    frame => { frame.joints.leftShoulder.x += .18; frame.joints.rightShoulder.x += .18; },
  ];
  for (const modify of modifications) {
    const h = harness(cropLegs); h.calibrate();
    const frames = h.hold(12, 0, modify);
    assert.ok(frames.every(frame => frame.heightRatio === 0 && frame.completion === null));
  }
});

test('upper-body cannot calibrate from a bent or moving torso', () => {
  const h = harness(cropLegs);
  assert.ok(h.hold(50, 0, frame => {
    frame.joints.leftShoulder.x += .18; frame.joints.rightShoulder.x += .18;
  }).every(frame => frame.stage === 'standing' && frame.calibrationProgress === 0));
  for (let i = 0; i < 50; i++) assert.equal(h.update(i % 2 ? .02 : 0).stage, 'standing');
});


test('manual torso calibration keeps a captured range beyond timeouts and confirms only after returning', () => {
  const h = harness(() => {}, { manualMaximum: true, preferUpperBody: true });
  h.hold(); assert.equal(h.recognizer.trackingMode, 'upper-body');
  assert.equal(h.recognizer.confirmMaximum(), false);
  h.hold(8, .04); assert.equal(h.recognizer.confirmMaximum(), false);
  const frames = h.hold(450);
  assert.equal(frames.at(-1).stage, 'maximum');
  assert.equal(frames.at(-1).canConfirmMaximum, true);
  assert.ok(frames.at(-1).measuredRise > .038);
  assert.ok(frames.every(f => !f.completion && f.heightRatio === 0));
  assert.equal(h.recognizer.confirmMaximum(), true);
  assert.equal(h.update().calibrated, true);
  assert.ok(h.hold(8, .02).at(-1).heightRatio > .45);
});

test('manual maximum survives slow return; jitter and stale or missing evidence cannot confirm', () => {
  const h = harness(() => {}, { manualMaximum: true, preferUpperBody: true });
  h.hold(); h.hold(20, .004); h.hold();
  assert.equal(h.recognizer.confirmMaximum(), false);
  h.jump(.012); assert.equal(h.update().cue, 'jump-higher-and-retry');
  assert.equal(h.recognizer.confirmMaximum(), false);
  h.hold(80, .08); assert.equal(h.update().stage, 'maximum');
  h.hold(10); assert.equal(h.update().canConfirmMaximum, true);
  const missing = h.pose(0, f => { f.joints = {}; }); h.recognizer.update(missing);
  assert.equal(h.recognizer.confirmMaximum(), false);
  assert.equal(h.recognizer.update(missing), null);
  h.hold(30, 0, f => { f.joints = {}; });
  assert.equal(h.update().stage, 'standing');
  assert.equal(h.recognizer.measuredRise, 0);
});

// A preparatory squat lowers both anchors and foreshortens/tilts the torso.
function crouch(frame) {
  for (const side of ['left', 'right']) {
    frame.joints[`${side}Hip`].y += .10;
    frame.joints[`${side}Shoulder`].y += .19;
    frame.joints[`${side}Shoulder`].x += .08;
  }
}

test('pre-jump crouch retains standing reference through manual calibration and live jumps', () => {
  const h = harness(() => {}, { manualMaximum: true, preferUpperBody: true });
  h.hold(); const baseline = { ...h.recognizer.baseline };
  const prep = h.hold(25, 0, crouch); // 1 second exceeds the old 400 ms reset timer.
  assert.ok(prep.every(f => f.stage === 'maximum' && f.phase !== 'missing'));
  assert.ok(prep.every(f => f.cue === 'prepare-jump' && !f.canConfirmMaximum && f.heightRatio === 0 && !f.completion));
  assert.deepEqual(h.recognizer.baseline, baseline);
  const unfolding = h.hold(3, 0, f => {
    for (const side of ['left', 'right']) {
      f.joints[side+'Hip'].y += .004;
      f.joints[side+'Shoulder'].y += .10;
      f.joints[side+'Shoulder'].x += .05;
    }
  });
  assert.ok(unfolding.every(f => f.phase !== 'missing' && f.stage === 'maximum'));
  h.hold(8, .14); h.hold(25, 0, crouch); // Land into a crouch, then stand back up.
  assert.equal(h.recognizer.confirmMaximum(), false);
  h.hold(8); assert.equal(h.recognizer.confirmMaximum(), true); h.update();
  const peak = h.recognizer.peakRise;
  const livePrep = h.hold(25, 0, crouch);
  assert.ok(livePrep.every(f => f.calibrated && f.heightRatio === 0 && !f.completion));
  const jump = [...h.hold(8, .07), ...h.hold(8)];
  assert.ok(Math.abs(Math.max(...jump.map(f => f.heightRatio)) - .5) < .02);
  assert.equal(jump.filter(f => f.completion).length, 1);
  assert.equal(h.recognizer.peakRise, peak); assert.deepEqual(h.recognizer.baseline, baseline);
});

test('crouching and rising to baseline alone never calibrates or scores, including quick start', () => {
  for (const options of [{ manualMaximum: true, preferUpperBody: true }, { quickStart: true, preferUpperBody: true }, {}]) {
    const h = harness(() => {}, options); h.hold(); const baseline = { ...h.recognizer.baseline };
    for (let cycle = 0; cycle < 3; cycle++) {
      const frames = [...h.hold(20, 0, crouch), ...h.hold(8)];
      assert.ok(frames.every(f => f.stage === 'maximum' && !f.calibrated && !f.completion && f.heightRatio === 0));
    }
    assert.deepEqual(h.recognizer.baseline, baseline);
    if (options.quickStart) assert.equal(h.hold(3, .03).at(-1).calibrated, true);
    else if (!options.manualMaximum) assert.equal(h.jump().at(-1).calibrated, true);
  }
});

test('crouching cannot bypass missing joints, sideways relocation or depth change guards', () => {
  for (const change of [
    f => { delete f.joints.leftHip; },
    f => { for (const joint of Object.values(f.joints)) joint.x += .17; },
    f => { for (const joint of Object.values(f.joints)) joint.x = .5 + (joint.x - .5) * 1.35; },
  ]) {
    const h = harness(() => {}, { manualMaximum: true, preferUpperBody: true }); h.hold();
    const frames = h.hold(30, 0, f => { crouch(f); change(f); });
    assert.ok(frames.every(f => !f.calibrated && !f.completion && f.heightRatio === 0));
    assert.equal(h.recognizer.baseline, null);
  }
});


const robustOptions = { manualMaximum: true, preferUpperBody: true, robustTracking: true };
test('robust calibration bridges mixed dropout and geometry noise through a crouched jump', () => {
  const h = harness(() => {}, robustOptions); h.hold();
  const baseline = { ...h.recognizer.baseline };
  h.hold(25, 0, crouch);
  const rejected = [
    h.update(.04, f => { f.joints.leftShoulder.y -= .10; }),
    h.update(.06, f => { f.joints.rightHip.confidence = .3; }),
    h.update(.08, f => { f.joints = {}; }),
  ];
  assert.ok(rejected.every(f => f.quality === 'tracking-grace' && !f.completion && !f.canConfirmMaximum));
  h.hold(6, .10);
  const captured = h.recognizer.measuredRise; assert.ok(captured > .09);
  h.hold(3, .12, f => { f.joints = {}; });
  assert.equal(h.recognizer.measuredRise, captured, 'no height is inferred from missing frames');
  h.hold(10, 0, crouch); h.hold(10);
  assert.equal(h.recognizer.confirmMaximum(), true);
  assert.deepEqual(h.recognizer.baseline, baseline);
});

test('robust filter rejects isolated height spikes, shoulder shrugs and width jitter', () => {
  const h = harness(() => {}, robustOptions); h.hold();
  for (let i = 0; i < 10; i++) {
    h.update(.13); h.hold(4);
    h.update(0, f => { f.joints.leftShoulder.y -= .12; }); h.hold(4);
  }
  h.hold(15, 0, f => { f.joints.leftHip.x += .018; });
  assert.equal(h.recognizer.stage, 'maximum');
  assert.equal(h.recognizer.measuredRise, 0); assert.equal(h.recognizer.confirmMaximum(), false);
  h.hold(7, .08); h.hold(10);
  assert.ok(h.recognizer.measuredRise > .075); assert.equal(h.recognizer.confirmMaximum(), true);
});

test('robust gaps never supply a landing and sustained missing or drift resets calibration', () => {
  for (const noise of [f => { f.joints = {}; }, f => { for (const j of Object.values(f.joints)) j.x += .18; }]) {
    const h = harness(() => {}, robustOptions); h.hold(); h.hold(7, .08); h.hold(10);
    assert.equal(h.recognizer.confirmMaximum(), true);
    h.hold(6, .05); h.hold(3, 0, noise);
    const returnFrames = h.hold(4);
    assert.ok(returnFrames.every(f => !f.completion), 'requires a new observed 200 ms landing');
    assert.equal(h.hold(8).filter(f => f.completion).length, 1);
    const lost = h.hold(30, 0, noise);
    assert.ok(lost.every(f => !f.completion && !f.canConfirmMaximum && f.heightRatio === 0));
    assert.equal(h.recognizer.baseline, null); assert.equal(h.recognizer.measuredRise, 0);
  }
});

test('robust standing preserves progress through a brief glitch without counting unseen time', () => {
  const h = harness(() => {}, robustOptions); h.hold(30);
  h.hold(5, 0, f => { f.joints = {}; });
  assert.equal(h.hold(5).at(-1).stage, 'standing');
  assert.equal(h.hold(10).at(-1).stage, 'maximum');
});


test('recovery after a silent gap beyond grace discards flight and requires an observed landing', () => {
  const h = harness(() => {}, robustOptions); h.hold(); h.hold(8, .08); h.hold(10);
  assert.equal(h.recognizer.confirmMaximum(), true);
  h.hold(6, .05); h.update(0, f => { f.joints = {}; });
  assert.equal(h.update(.05, undefined, 400).phase, 'missing');
  assert.ok(h.hold(10).every(f => !f.completion));
});


test('configured jump range skips maximum measurement but requires a fresh upright baseline', () => {
  const h = harness(() => {}, robustOptions);
  assert.equal(h.recognizer.setJumpRange(.25), true);
  assert.equal(h.recognizer.confirmMaximum(), false);
  h.hold(); assert.equal(h.recognizer.measuredRise, 0);
  assert.equal(h.recognizer.canConfirmMaximum, true);
  h.update(0, f => { f.joints = {}; });
  assert.equal(h.recognizer.confirmMaximum(), false);
  h.hold(10);
  assert.equal(h.recognizer.confirmMaximum(), true);
  assert.ok(Math.abs(h.recognizer.peakRise - .23 * .25) < .0001);
  assert.equal(h.recognizer.setJumpRange(.5), false, 'confirmed range stays fixed');
  assert.ok(h.hold(6, .025).at(-1).heightRatio > .4);
  for (const bad of [NaN, Infinity, -.1, 0, .09, .81, '0.25']) assert.throws(()=>h.recognizer.setJumpRange(bad), RangeError);
});

test('range preview changes with the slider without charging or pretending a measured maximum', () => {
  const h = harness(() => {}, robustOptions); h.recognizer.setJumpRange(.1); h.hold();
  const small = h.hold(6, .02).at(-1);
  assert.ok(small.previewHeightRatio > .8); assert.equal(small.progress, 0); assert.equal(small.completion, null);
  h.recognizer.setJumpRange(.8);
  const large = h.update(.02); assert.ok(large.previewHeightRatio < .12);
  h.recognizer.recalibrate(); assert.equal(h.recognizer.canConfirmMaximum, false);
  assert.equal(h.recognizer.configuredRange, .8, 'preference survives recalibration, the old baseline does not');
});

test('gameplay retention survives prolonged noise and gaps without crediting an unseen landing', () => {
  const h = harness(()=>{}, {manualMaximum:true, preferUpperBody:true, robustTracking:true, retainCalibration:true});
  h.recognizer.setJumpRange(.15); h.hold(50); assert.equal(h.recognizer.confirmMaximum(),true);
  const baseline = {...h.recognizer.baseline};
  h.hold(5,.04); h.hold(8);
  const rep = h.recognizer.repIndex;
  h.hold(5,.04);
  const lost = h.hold(50,0,f=>{f.joints={};});
  assert.ok(lost.every(f=>f.calibrated && f.phase==='missing' && !f.completion));
  assert.deepEqual(h.recognizer.baseline,baseline);
  const air=h.hold(80,.04); // Returning still elevated cannot re-arm or reset setup.
  assert.ok(air.every(f=>f.calibrated && !f.completion));
  assert.deepEqual(h.recognizer.baseline,baseline);
  h.recognizer.update(h.pose(0,()=>{},1500));h.hold(8);
  assert.equal(h.recognizer.repIndex,rep);
  h.hold(6,.04);
  assert.equal(h.hold(10).filter(f=>f.completion).length,1);
  assert.equal(h.recognizer.repIndex,rep+1);
  h.recognizer.reset({...session,sessionId:'new-round'});
  assert.equal(h.recognizer.stage,'standing');assert.equal(h.recognizer.baseline,null);
});

test('retained gameplay reference survives position rejection and flight timeout', () => {
  const h = harness(()=>{}, {manualMaximum:true, preferUpperBody:true, robustTracking:true, retainCalibration:true});
  h.recognizer.setJumpRange(.15);h.hold(50);h.recognizer.confirmMaximum();
  const baseline={...h.recognizer.baseline};
  const drift=h.hold(35,0,f=>{for(const joint of Object.values(f.joints))joint.x+=.2;});
  assert.ok(drift.every(f=>f.calibrated && f.phase==='missing'));
  h.hold(8); const held=h.hold(80,.04);
  assert.ok(held.every(f=>f.calibrated && !f.completion));
  assert.deepEqual(h.recognizer.baseline,baseline);h.hold(10);
  assert.equal(h.recognizer.repIndex,0);
});
