import test from 'node:test';
import assert from 'node:assert/strict';
import {SquatDetector,poseFeatures} from '../packages/action-squat/detector.js';
import {SquatRecognizer} from '../packages/action-squat/index.js';
import {squatSession} from '../contracts/fixtures/squat-session.js';
import {squatRobustnessCases} from '../experiments/evaluation/squat-robustness/fixtures.mjs';
import {evaluateSquatCases,matchCompletions} from '../experiments/evaluation/squat-robustness/evaluate.mjs';

for(const fixture of squatRobustnessCases())test(`squat event regression: ${fixture.id}`,()=>{
  const [result]=evaluateSquatCases([fixture]);
  assert.equal(result.falseCompletions,0);assert.equal(result.missedCompletions,0);
  assert.equal(result.observedCount,result.expectedCount);
});
test('event scoring rejects early/extra completions and never matches one event twice',()=>{
  assert.deepEqual(matchCompletions([1000,3000],[800,1100,1200,3100]),{falseCompletions:2,missedCompletions:0,delays:[100,100]});
  assert.deepEqual(matchCompletions([1000,1200],[1300]),{falseCompletions:0,missedCompletions:1,delays:[300]});
  assert.deepEqual(matchCompletions([1000],[1700]),{falseCompletions:1,missedCompletions:1,delays:[]});
});
test('a collapsed thigh or shin is rejected while one usable side remains available',()=>{
  const points=structuredClone(squatSession(1)[30].joints);
  points.leftKnee={...points.leftHip};points.rightKnee={...points.rightAnkle};
  assert.equal(poseFeatures(points),null);
  points.rightKnee={...squatSession(1)[30].joints.rightKnee};
  assert.ok(poseFeatures(points));
});
test('automatic recovery neither scores a partial cycle nor reuses a completed event ID',()=>{
  const first=squatSession(1),second=squatSession(1).map(frame=>({...frame,seq:frame.seq+first.length,tMs:frame.tMs+first.at(-1).tMs,
    joints:Object.fromEntries(Object.entries(frame.joints).map(([name,p])=>[name,{...p,y:p.y+.04}]))}));
  const recognizer=new SquatRecognizer();recognizer.reset(first[0]);
  const completions=[...first,...second].map(frame=>recognizer.update(frame)).filter(action=>action.completion);
  assert.equal(completions.length,2);assert.notEqual(completions[0].completion.id,completions[1].completion.id);
  assert.equal(completions[1].completion.repIndex,2);
  const detector=new SquatDetector();let time=0;const feed=(feature,frames)=>{let result;for(let i=0;i<frames;i++){time+=80;result=detector.updateFeatures(feature,time);assert.equal(result.rep,false);}return result;};
  feed({angle:175,hip:.45,torso:.2},30);feed({angle:120,hip:.53,torso:.2},12);
  assert.equal(feed({angle:175,hip:.5,torso:.2},30).state,'ready');
  assert.equal(detector.phase,'stand');
});
test('moving closer during calibration cannot establish a stationary baseline',()=>{
  const detector=new SquatDetector();let result;
  for(let i=0;i<30;i++)result=detector.updateFeatures({angle:175,hip:.45,torso:.1+i*.012},80*(i+1));
  assert.equal(detector.baseline,null);assert.equal(result.rep,false);
});
test('scale recovery requires a stable upright torso and never scores while recalibrating',()=>{
  const detector=new SquatDetector();let time=0;
  const feed=torso=>{time+=80;const result=detector.updateFeatures({angle:175,hip:.45,torso},time);assert.equal(result.rep,false);return result;};
  for(let i=0;i<25;i++)feed(.2);
  const original=detector.baseline.torso;
  for(let i=0;i<30;i++)feed(.3+i*.015);
  assert.equal(detector.baseline.torso,original);
  let result;for(let i=0;i<30;i++)result=feed(.3);
  assert.equal(result.state,'ready');assert.ok(Math.abs(detector.baseline.torso-.3)<.005);
});
