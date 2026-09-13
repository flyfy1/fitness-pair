import test from 'node:test';
import assert from 'node:assert/strict';
import { PlankRecognizer, supportGeometry } from '../src/recognizer.js';
import { fromMediaPipe } from '../src/pose-provider.js';
import { createFlight,consumeAction,stepFlight } from '../src/engine.js';
import { assertActionFrame } from '../../../../contracts/index.js';
import { pose } from './fixtures.js';

test('synthetic high plank, forearm and low push-up support; reject upright, bent and prone shapes',()=>{
  for(const name of ['high','forearm','low'])assert.equal(supportGeometry(pose(0,name)).supported,true,name);
  for(const name of ['rest','prone','standing'])assert.equal(supportGeometry(pose(0,name)).supported,false,name);
  assert.equal(supportGeometry(pose(0,'missing')),null);
  const f=pose();for(const p of Object.values(f.joints))p.confidence=null;assert.equal(supportGeometry(f),null);
});
test('calibration requires contiguous support, gaps reset it, stale and foreign input ignored',()=>{
  const r=new PlankRecognizer();r.reset(pose());
  for(let t=0;t<1200;t+=100){const a=r.update(pose(t));assertActionFrame(a);assert.equal(a.phase,'calibrating');assert.equal(a.progress,0);}
  assert.equal(r.update(pose(1200)).phase,'active');assert.equal(r.update(pose(1200)),null);
  assert.equal(r.update(pose(1300,'high',{sessionId:'other'})),null);
  assert.equal(r.update(pose(1300,'high',{source:{kind:'camera',id:'x'}})),null);
  assert.equal(r.update(pose(1300,'rest')).phase,'ready');assert.equal(r.update(pose(1400,'missing')).phase,'missing');
  r.recalibrate();assert.equal(r.update(pose(1500)).phase,'calibrating');assert.equal(r.update(pose(3000)).calibrationProgress,0);
  assert.throws(()=>r.update(pose(3100,'high',{modelId:'new'})));
});
function action(t,active=true){return {version:1,...pose(t),inputSeq:t+1,recognizerId:'fixture',action:'plank-hold',phase:active?'active':'ready',progress:active?1:0,calibrationProgress:null,cue:'test',completion:null};}
test('flight consumes identity-bound input, holds time, coasts and crashes without inventing repetitions',()=>{
  const s=createFlight(pose());assert.equal(consumeAction(s,{...action(0),sessionId:'other'}),false);
  consumeAction(s,action(0));assert.equal(consumeAction(s,action(0)),false);
  for(let t=20;t<=1000;t+=20){consumeAction(s,action(t));stepFlight(s,.02,t);}
  assert.ok(Math.abs(s.holdSeconds-1)<.001);assert.equal(s.completedReps,0);
  for(let t=1020;t<3900;t+=20){consumeAction(s,action(t,false));stepFlight(s,.02,t);}
  assert.equal(s.status,'flying');
  for(let t=3900;t<4200;t+=20){consumeAction(s,action(t,false));stepFlight(s,.02,t);}
  assert.equal(s.status,'crashing');assert.equal(s.reason,'rest');
  for(let t=4200;t<6000;t+=20)stepFlight(s,.02,t);
  assert.equal(s.finished,true);assert.equal(s.health,0);
});
test('brief rest can recover; stale tracking accrues neither flight nor hold time',()=>{
  const s=createFlight(pose());consumeAction(s,action(0));stepFlight(s,.02,400);assert.equal(s.holdSeconds,0);
  for(let t=500;t<2000;t+=20){consumeAction(s,action(t,false));stepFlight(s,.02,t);}assert.ok(s.releasedSeconds>1);
  consumeAction(s,action(2000));stepFlight(s,.02,2000);assert.equal(s.releasedSeconds,0);
});
test('obstacle collisions and gate passage use flight geometry',()=>{
  const s=createFlight(pose());consumeAction(s,action(0));s.y=.2;s.obstacles=[{x:.28,gap:.6}];stepFlight(s,.02,0);assert.equal(s.reason,'obstacle');
  const safe=createFlight(pose());consumeAction(safe,action(0));safe.y=.5;safe.obstacles=[{x:.19,gap:.5,counted:false}];stepFlight(safe,.02,0);stepFlight(safe,.02,10);assert.equal(safe.passed,1);
});
test('provider adds optional head hints; low confidence and missing head never invent a face',()=>{
  const landmarks=[];landmarks[0]={x:.2,y:.3,visibility:.9};landmarks[11]={x:.3,y:.4,visibility:.9};landmarks[23]={x:.5,y:.4,visibility:.9};
  const args={...pose(),width:640,height:480,landmarks};assert.ok(fromMediaPipe(args).head.sizePx>0);
  landmarks[0].visibility=.2;assert.equal(fromMediaPipe(args).head,undefined);
});
