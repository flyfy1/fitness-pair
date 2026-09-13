import test from 'node:test';
import assert from 'node:assert/strict';
import { HeadFlightController, TAKEOFF_MS } from '../src/recognizer.js';
import { fromMediaPipe } from '../src/pose-provider.js';
import { createFlight,consumeAction,stepFlight,crash } from '../src/engine.js';
import { projectHead } from '../src/projection.js';
import { assertActionFrame } from '../../../../contracts/index.js';
import { pose } from './fixtures.js';
import { TrackingGate } from '../src/tracking-gate.js';
import { flightSpeed, setDifficulty, gateOpening } from '../src/difficulty.js';

function active(t,x=.4,y=.35){return {version:1,sessionId:'test',source:{kind:'synthetic',id:'fixture'},inputSeq:t+1,tMs:t,
  recognizerId:'fixture',action:'head-flight',phase:'active',progress:1,calibrationProgress:null,cue:'Head follows',completion:null,
  headControl:{x,y,image:{width:640,height:480}}};}
test('head and one shoulder take off automatically without full-body geometry or extra motion',()=>{
  const r=new HeadFlightController();
  for(let t=0;t<TAKEOFF_MS;t+=100){const a=r.update(pose(t));assertActionFrame(a);assert.equal(a.phase,'calibrating');assert.equal(a.progress,0);}
  const a=r.update(pose(TAKEOFF_MS));assert.equal(a.phase,'active');assert.equal(a.completion,null);
  assert.deepEqual(a.headControl,{x:.4,y:.35,image:{width:640,height:480}});
  assert.equal(r.update(pose(900,{y:.7})).headControl.y,.7);
  assert.equal(r.update(pose(1000,{y:.3})).headControl.y,.3);
});
test('missing head/shoulder and low confidence explain waiting; gaps reset takeoff',()=>{
  const r=new HeadFlightController();
  assert.equal(r.update(pose(0,{head:false})).phase,'missing');
  assert.match(r.update(pose(100,{shoulder:false})).cue,/shoulder/);
  assert.equal(r.update({...pose(200),head:{x:.3,y:.2,confidence:null}}).phase,'missing');
  r.update(pose(300));r.update(pose(400));
  assert.equal(r.update(pose(1000)).calibrationProgress,0);
  assert.equal(r.update(pose(1100,{x:1.2})).phase,'missing');
});
test('stale, duplicate and foreign input cannot steer; model changes need a fresh session',()=>{
  const r=new HeadFlightController();r.update(pose(100));
  assert.equal(r.update(pose(100)),null);assert.equal(r.update(pose(90)),null);
  assert.equal(r.update(pose(200,{sessionId:'other'})),null);
  assert.equal(r.update(pose(200,{source:{kind:'camera',id:'other'}})),null);
  assert.throws(()=>r.update(pose(200,{modelId:'other'})));
  const s=createFlight(pose());consumeAction(s,active(0));
  assert.equal(consumeAction(s,{...active(100),sessionId:'other'}),false);
  assert.equal(consumeAction(s,{...active(100),headControl:{x:NaN,y:.3,image:{width:640,height:480}}}),false);
  assert.equal(consumeAction(s,{...active(100),headControl:null}),false);
});
test('head down/up and left/right map directly to mirrored video; holding never adds lift or reps',()=>{
  const s=createFlight(pose()),viewport={width:640,height:480};
  for(const [t,x,y] of [[0,.4,.3],[100,.4,.7],[200,.2,.3]]){
    consumeAction(s,active(t,x,y));stepFlight(s,.02,t,viewport);assert.equal(s.x,1-x);assert.equal(s.y,y);
  }
  for(let t=300;t<4500;t+=100){consumeAction(s,active(t,.2,.3));stepFlight(s,.05,t,viewport);}
  assert.equal(s.status,'flying');assert.equal(s.y,.3);assert.equal(s.completedReps,0);
  const elapsed=s.flightSeconds;stepFlight(s,.05,5000,viewport);assert.ok(s.flightSeconds>elapsed);assert.equal(s.y,.3);
});
test('portrait and landscape cover projections match the centered camera crop',()=>{
  const head={x:.2,y:.3,image:{width:640,height:480}};
  const landscape=projectHead(head,1440,960);assert.equal(landscape.x,.8);assert.ok(Math.abs(landscape.y-264/960)<1e-10);
  const portrait=projectHead(head,390,844);assert.ok(Math.abs(portrait.x-(.8*(844/480*640)-(844/480*640-390)/2)/390)<1e-10);assert.equal(portrait.y,.3);
});
test('collision uses the current head position; finished flights crash and cannot be steered',()=>{
  const s=createFlight(pose());consumeAction(s,active(0,.5,.2));s.obstacles=[{x:.5,gap:.7,counted:false}];
  for(let t=0;t<220;t+=20)stepFlight(s,.02,t,{width:640,height:480});assert.equal(s.reason,'obstacle');assert.equal(s.status,'crashing');
  assert.equal(consumeAction(s,active(100)),false);
  for(let t=0;t<2000;t+=20)stepFlight(s,.02,t);assert.equal(s.finished,true);
  const safe=createFlight(pose());consumeAction(safe,active(0,.5,.5));safe.obstacles=[{x:.15,gap:.5,counted:false}];
  stepFlight(safe,.02,0,{width:640,height:480});stepFlight(safe,.02,20,{width:640,height:480});assert.equal(safe.passed,1);
  crash(safe,'rest');assert.equal(safe.status,'crashing');
});
test('head provider works without hips/legs, preserves confidence and can use an ear',()=>{
  const landmarks=[];landmarks[0]={x:.2,y:.3,visibility:.9};landmarks[11]={x:.3,y:.5,visibility:.9};
  const args={...pose(),width:640,height:480,landmarks};const f=fromMediaPipe(args);
  assert.ok(f.head.sizePx>=40);assert.equal(f.head.confidence,.9);assert.equal(f.joints.leftHip,undefined);
  landmarks[0].visibility=.2;assert.equal(fromMediaPipe(args).head,undefined);
  landmarks[7]={x:.25,y:.3,visibility:.8};assert.equal(fromMediaPipe(args).head.x,.25);
});

test('brief tracking loss holds position until 200 ms of good input; there is no reset deadline',()=>{
  const gate=new TrackingGate();gate.reset(0);assert.equal(gate.status(100).held,false);
  assert.equal(gate.observe(false,120).held,true);assert.equal(gate.observe(true,150).held,true);
  gate.observe(false,180);gate.observe(true,200);assert.equal(gate.observe(true,350).held,true);
  assert.equal(gate.observe(true,400).held,false);assert.equal(gate.status(900).held,true);
  assert.equal(gate.status(100_000).held,true);gate.observe(true,100_010);assert.equal(gate.observe(true,100_210).held,false);
});
test('lost tracking keeps position but advances obstacles, elapsed time, acceleration and eventual collision',()=>{
  const s=createFlight(pose());consumeAction(s,active(0,.5,.2));stepFlight(s,.01,0,{width:640,height:480});
  s.trackingHeld=true;s.obstacles=[{x:.6,gap:.7,counted:false}];const x=s.x,y=s.y;
  for(let t=20;t<1500&&s.status==='flying';t+=20)stepFlight(s,.02,t,{width:640,height:480});
  assert.equal(s.x,x);assert.equal(s.y,y);assert.ok(s.flightSeconds>.1);assert.ok(s.speedGain>0);
  assert.equal(s.reason,'obstacle');assert.equal(s.status,'crashing');
});
test('a single contact frame is harmless; sustained contact crashes',()=>{
  const s=createFlight(pose());consumeAction(s,active(0,.5,.2));s.obstacles=[{x:.5,gap:.7,counted:false}];
  stepFlight(s,.02,0,{width:640,height:480});assert.equal(s.status,'flying');
  consumeAction(s,active(20,.5,.7));stepFlight(s,.02,20,{width:640,height:480});assert.equal(s.collisionSeconds,0);
  consumeAction(s,active(40,.5,.2));
  for(let t=40;t<260;t+=20)stepFlight(s,.02,t,{width:640,height:480});assert.equal(s.reason,'obstacle');
});
test('three live difficulty controls change existing gates, speed and future acceleration without restarting',()=>{
  const s=createFlight(pose());consumeAction(s,active(0));s.obstacles=[{x:1,gap:.3,counted:false}];
  const gate=s.obstacles[0],session=s.sessionId;setDifficulty(s,{opening:.7,speed:.4,acceleration:1.5});
  assert.ok(Math.abs(gateOpening(gate,s.difficulty).bottom-gateOpening(gate,s.difficulty).top-.7)<1e-10);
  const before=gate.x;stepFlight(s,.05,0,{width:640,height:480});assert.ok(gate.x<before);assert.ok(flightSpeed(s)>.4);
  const speed=flightSpeed(s);setDifficulty(s,{...s.difficulty,acceleration:0});assert.equal(flightSpeed(s),speed);
  for(let t=100;t<2000;t+=50)stepFlight(s,.05,t,{width:640,height:480});assert.equal(flightSpeed(s),speed);
  setDifficulty(s,{...s.difficulty,speed:1.8});assert.equal(flightSpeed(s),1.8);assert.equal(s.sessionId,session);assert.equal(s.obstacles[0],gate);
  setDifficulty(s,{opening:100,speed:-1,acceleration:NaN});assert.deepEqual(s.difficulty,{opening:.7,speed:.4,acceleration:.4});
});
test('acceleration grows over active game time, including held tracking, and caps at 3x',()=>{
  const s=createFlight(pose(),{speed:1,opening:.5,acceleration:1.5});consumeAction(s,active(0));s.trackingHeld=true;
  for(let t=0;t<120_000;t+=50){s.obstacles=[];stepFlight(s,.05,t,{width:640,height:480});}
  assert.equal(s.status,'flying');assert.equal(flightSpeed(s),3);
});
