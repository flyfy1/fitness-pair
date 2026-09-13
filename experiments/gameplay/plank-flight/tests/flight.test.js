import test from 'node:test';
import assert from 'node:assert/strict';
import { HeadFlightController, TAKEOFF_MS } from '../src/recognizer.js';
import { fromMediaPipe } from '../src/pose-provider.js';
import { createFlight,consumeAction,stepFlight,crash } from '../src/engine.js';
import { projectHead, helicopterHeight, helicopterWidth } from '../src/projection.js';
import { assertActionFrame } from '../../../../contracts/index.js';
import { pose } from './fixtures.js';
import { TrackingGate } from '../src/tracking-gate.js';
import { flightSpeed, setDifficulty, gateOpening } from '../src/difficulty.js';

// Most tests exercise flight physics directly; countdown timing has its own test below.
function flyingFlight(...args){const state=createFlight(...args);state.status='flying';return state;}
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
  const s=flyingFlight(pose());consumeAction(s,active(0));
  assert.equal(consumeAction(s,{...active(100),sessionId:'other'}),false);
  assert.equal(consumeAction(s,{...active(100),headControl:{x:NaN,y:.3,image:{width:640,height:480}}}),false);
  assert.equal(consumeAction(s,{...active(100),headControl:null}),false);
});
test('head down/up and left/right map directly to mirrored video; holding never adds lift or reps',()=>{
  const s=flyingFlight(pose()),viewport={width:640,height:480};
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
  const s=flyingFlight(pose());consumeAction(s,active(0,.5,.2));s.obstacles=[{x:.5,gap:.7,counted:false}];
  for(let t=0;t<220;t+=20)stepFlight(s,.02,t,{width:640,height:480});assert.equal(s.reason,'obstacle');assert.equal(s.status,'crashing');
  assert.equal(consumeAction(s,active(100)),false);
  for(let t=0;t<2000;t+=20)stepFlight(s,.02,t);assert.equal(s.finished,true);
  const safe=flyingFlight(pose());consumeAction(safe,active(0,.5,.5));safe.obstacles=[{x:.15,gap:.5,counted:false}];
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
  const s=flyingFlight(pose());consumeAction(s,active(0,.5,.2));stepFlight(s,.01,0,{width:640,height:480});
  s.trackingHeld=true;s.obstacles=[{x:.6,gap:.7,counted:false}];const x=s.x,y=s.y;
  for(let t=20;t<1500&&s.status==='flying';t+=20)stepFlight(s,.02,t,{width:640,height:480});
  assert.equal(s.x,x);assert.equal(s.y,y);assert.ok(s.flightSeconds>.1);assert.ok(s.speedGain>0);
  assert.equal(s.reason,'obstacle');assert.equal(s.status,'crashing');
});
test('a single contact frame is harmless; sustained contact crashes',()=>{
  const s=flyingFlight(pose());consumeAction(s,active(0,.5,.2));s.obstacles=[{x:.5,gap:.7,counted:false}];
  stepFlight(s,.02,0,{width:640,height:480});assert.equal(s.status,'flying');
  consumeAction(s,active(20,.5,.7));stepFlight(s,.02,20,{width:640,height:480});assert.equal(s.collisionSeconds,0);
  consumeAction(s,active(40,.5,.2));
  for(let t=40;t<260;t+=20)stepFlight(s,.02,t,{width:640,height:480});assert.equal(s.reason,'obstacle');
});
test('three live difficulty controls change existing gates, speed and future acceleration without restarting',()=>{
  const s=flyingFlight(pose());consumeAction(s,active(0));s.obstacles=[{x:1,gap:.3,counted:false}];
  const gate=s.obstacles[0],session=s.sessionId;setDifficulty(s,{opening:6,speed:.4,acceleration:1.5});
  assert.ok(Math.abs(gateOpening(gate,s.difficulty).bottom-gateOpening(gate,s.difficulty).top-6*helicopterHeight(1280)/720)<1e-10);
  const before=gate.x;stepFlight(s,.05,0,{width:640,height:480});assert.ok(gate.x<before);assert.ok(flightSpeed(s)>.4);
  const speed=flightSpeed(s);setDifficulty(s,{...s.difficulty,acceleration:0});assert.equal(flightSpeed(s),speed);
  for(let t=100;t<2000;t+=50)stepFlight(s,.05,t,{width:640,height:480});assert.equal(flightSpeed(s),speed);
  setDifficulty(s,{...s.difficulty,speed:6});assert.equal(flightSpeed(s),6);assert.equal(s.sessionId,session);assert.equal(s.obstacles[0],gate);
  setDifficulty(s,{opening:100,speed:-1,acceleration:NaN});assert.deepEqual(s.difficulty,{opening:6,speed:.4,acceleration:.4});
});
test('acceleration grows over active game time, including held tracking, and caps at 10x',()=>{
  const s=flyingFlight(pose(),{speed:1,opening:4,acceleration:1.5});consumeAction(s,active(0));s.trackingHeld=true;
  for(let t=0;t<400_000;t+=50){s.obstacles=[];stepFlight(s,.05,t,{width:640,height:480});}
  assert.equal(s.status,'flying');assert.equal(flightSpeed(s),10);
});

test('missing actions preserve the last control and position until valid control returns',()=>{
  const s=flyingFlight(pose()),view={width:640,height:480};
  consumeAction(s,active(0,.4,.3));stepFlight(s,.01,0,view);const head={...s.headControl};
  for(let t=50;t<=4000;t+=50){
    consumeAction(s,{...active(t),phase:'missing',progress:0,headControl:null});
    stepFlight(s,.05,t,view);assert.equal(s.x,.6);assert.equal(s.y,.3);assert.deepEqual(s.headControl,head);
  }
  assert.equal(s.status,'flying');assert.equal(s.trackingHeld,true);
  consumeAction(s,active(4100,.5,.6));stepFlight(s,.01,4100,view);
  assert.equal(s.trackingHeld,false);assert.equal(s.x,.5);assert.equal(s.y,.6);
});
test('hardest opening is twice the helicopter height across viewport sizes',()=>{
  for(const view of [{width:1440,height:960},{width:390,height:844},{width:844,height:390}]){
    const s=flyingFlight(pose(),{opening:2});
    for(const center of [.2,.5,.8]){
      const gap=gateOpening({gap:center},s.difficulty,view);
      assert.ok(Math.abs((gap.bottom-gap.top)*view.height-2*helicopterHeight(view.width))<1e-8);
      assert.ok(gap.top>=0&&gap.bottom<=1);
    }
  }
});
test('fast gates still collide at 10x, while centered flight passes the 2x opening',()=>{
  for(const view of [{width:1440,height:960},{width:390,height:844},{width:844,height:390}]){
    for(const blocked of [true,false]){
      const s=flyingFlight(pose(),{opening:2,speed:6,acceleration:0});
      consumeAction(s,active(0));s.trackingHeld=true;s.x=.5;s.y=blocked?.1:.5;s.speedGain=4;
      s.obstacles=[{x:.8,gap:.5,counted:false}];
      for(let t=0;t<1000&&s.status==='flying';t+=50)stepFlight(s,.05,t,view);
      assert.equal(s.status,blocked?'crashing':'flying');
      if(!blocked)assert.equal(s.passed,1);
    }
  }
});

test('the first gate enters at three seconds and roomy screens retain the three-second cadence',()=>{
  const s=flyingFlight(pose(),{speed:1,acceleration:0}),view={width:1440,height:720};
  consumeAction(s,active(0));s.trackingHeld=true;s.x=.1;s.y=.3;
  for(let i=0;i<59;i++)stepFlight(s,.05,i*50,view);
  assert.equal(s.spawned,0);assert.equal(s.obstacles.length,0);
  for(let i=0;i<2;i++)stepFlight(s,.05,2950+i*50,view);
  assert.equal(s.spawned,1);assert.ok(s.obstacles[0].x*view.width-17<view.width);
  for(let i=0;i<60;i++)stepFlight(s,.05,3050+i*50,view);
  assert.equal(s.spawned,2);assert.equal(s.obstacles.length,2);
  const distance=s.obstacles[1].x-s.obstacles[0].x;
  assert.ok(Math.abs(distance-.105*3)<.002);
});

test('three-second countdown tracks the head but delays flight time, speed gain and gates',()=>{
  const s=createFlight(pose());consumeAction(s,active(0));assert.equal(s.status,'countdown');
  for(let i=0;i<50;i++){consumeAction(s,active(i*50+1,.4,.3));stepFlight(s,.05,i*50+1,{width:640,height:480});}
  assert.equal(s.status,'countdown');assert.equal(s.flightSeconds,0);assert.equal(s.speedGain,0);assert.equal(s.obstacles.length,0);
  assert.equal(s.x,.6);assert.equal(s.y,.3);
  consumeAction(s,{...active(2600),phase:'missing',progress:0,headControl:null});
  for(let i=0;i<10;i++)stepFlight(s,.05,2600+i*50,{width:640,height:480});
  assert.equal(s.status,'flying');assert.equal(s.flightSeconds,0);assert.equal(s.x,.6);assert.equal(s.y,.3);
  stepFlight(s,.05,3100);assert.ok(s.flightSeconds>0);
});


test('horizontal clearance stays at least two visible helicopter widths through difficulty changes and resize',()=>{
  for(const width of [390,844,1280]) {
    const s=flyingFlight(pose(),{speed:.4,acceleration:0});
    s.trackingHeld=true;s.x=-2;
    let spawnTime=0,spawnCount=0,pairs=0;
    for(let i=0;i<3600;i++) {
      const view={width:i<1800?width:390,height:720};
      if(i===1200)setDifficulty(s,{speed:6,acceleration:1.5,opening:2});
      if(i===2400)setDifficulty(s,{speed:.4,acceleration:0,opening:6});
      stepFlight(s,.05,i*50,view);
      if(s.spawned>spawnCount) {
        assert.equal(s.spawned,spawnCount+1);
        assert.ok(s.flightSeconds-spawnTime>=3-1e-8);
        spawnCount=s.spawned;spawnTime=s.flightSeconds;
      }
      for(let j=1;j<s.obstacles.length;j++) {
        pairs++;
        const clearance=(s.obstacles[j].x-s.obstacles[j-1].x)*view.width-34;
        assert.ok(clearance>=2*helicopterWidth(view.width)-1e-8,`clearance ${clearance} at ${view.width}px`);
      }
    }
    assert.ok(pairs>0);assert.ok(spawnCount>5);
  }
});
