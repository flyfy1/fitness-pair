import test from 'node:test';
import assert from 'node:assert/strict';
import { ShoulderMotionRecognizer } from '../src/shoulder-motion.js';

const session = { sessionId: 'synthetic-cropped', source: { kind: 'synthetic', id: 'shoulders-only' } };
function harness() {
  const recognizer = new ShoulderMotionRecognizer(); recognizer.reset(session);
  let seq = 0, tMs = 0, last;
  const frame = (rise = 0, modify = () => {}, dt = 40) => {
    last = { version:1, ...session, seq:seq++, tMs:tMs+=dt, modelId:'synthetic-shoulders',
      coordinateSpace:'image-normalized-unmirrored', image:{width:640,height:480},
      joints:{leftShoulder:{x:.4,y:.35-rise,confidence:.8},rightShoulder:{x:.6,y:.35-rise,confidence:.8}} };
    modify(last); return last;
  };
  const update = (...args) => recognizer.update(frame(...args));
  const hold = (n=7,rise=0,modify) => Array.from({length:n},()=>update(rise,modify));
  return {recognizer,frame,update,hold,last:()=>last};
}

test('shoulder-only camera starts before landing; height follows motion and completion IDs survive resets',()=>{
  const h=harness(); assert.equal(h.hold().at(-1).cue,'jump-to-start');
  const lift=h.hold(3,.025); assert.equal(lift.at(-1).calibrated,true); assert.equal(lift.at(-1).completion,null);
  const peak=h.hold(4,.06).at(-1); assert.ok(peak.heightRatio>lift.at(-1).heightRatio);
  const landed=h.hold().filter(f=>f.completion); assert.equal(landed.length,1);
  const firstId=landed[0].completion.id;
  h.recognizer.recalibrate(); h.hold(); h.hold(3,.025);
  const second=h.hold().find(f=>f.completion); assert.notEqual(second.completion.id,firstId);
});

test('cropped or low-confidence hips cannot block shoulder motion',()=>{
  const h=harness(); const badHips=f=>{
    f.joints.leftHip={x:.4,y:1.2,confidence:.1}; f.joints.rightHip={x:.6,y:.9,confidence:null};
  };
  h.hold(7,0,badHips); assert.equal(h.hold(3,.025,badHips).at(-1).calibrated,true);
});

test('jitter, one shoulder, one-frame spikes, missing shoulders and stale/foreign frames cannot score',()=>{
  const h=harness(); h.hold();
  assert.ok(h.hold(8,.004).every(f=>!f.calibrated));
  assert.ok(h.hold(4,0,f=>{f.joints.leftShoulder.y-=.05;}).every(f=>!f.calibrated));
  assert.equal(h.update(.025).calibrated,false); assert.ok(h.hold().every(f=>!f.completion));
  assert.equal(h.recognizer.update(h.last()),null);
  assert.throws(()=>h.recognizer.update({...h.frame(),sessionId:'foreign'}));
  assert.equal(h.update(0,f=>{delete f.joints.rightShoulder;}).phase,'missing');
  assert.equal(h.update(0,f=>{f.joints.leftShoulder.confidence=null;}).phase,'missing');
});

test('loss cancels a pending completion and long loss or camera drift resets the reference',()=>{
  const h=harness(); h.hold(); h.hold(3,.025);
  h.update(0,f=>{f.joints={};});
  assert.ok(h.hold().every(f=>!f.completion));
  const lost=h.update(0,f=>{f.joints={};},800); assert.equal(lost.calibrated,false);
  h.hold(); h.hold(3,.025);
  assert.equal(h.update(0,f=>{f.joints.leftShoulder.x+=.2;f.joints.rightShoulder.x+=.2;}).calibrated,false);
});
