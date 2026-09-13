import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimatedRunner } from '../src/animated-runner.js';

function fixture() {
  const events = [], g = new AnimatedRunner({onEvent:(event,data)=>events.push({event,...data})});
  const session = {sessionId:'test',source:{kind:'synthetic',id:'animation-test'}};
  g.setControlMode('motion'); g.bindMotionSession(session); g.command('start'); g.spawnIn=100;
  let seq=0, time=0;
  const send=(heightRatio=0,phase=heightRatio?'active':'ready',extra={})=>{
    time+=1000/30;
    const frame={version:1,...session,inputSeq:++seq,tMs:time,recognizerId:'test',action:'jump-height',
      phase,cue:'ready',progress:heightRatio,calibrationProgress:null,completion:null,
      heightRatio,calibrated:true,stage:'ready',...extra};
    g.applyMotion(frame);return frame;
  };
  const tick=(height=0,phase,extra)=>{send(height,phase,extra);g.step(1/30);};
  tick();
  return {g,send,tick,events};
}

test('short and long body cycles produce complete arcs, with continuous landing and duration-based height',()=>{
  const run=frames=>{
    const {g,tick,send,events}=fixture();
    for(let i=0;i<frames;i++)tick(.5);
    const before=g.y, velocity=g.arc.velocity;
    send(0,'active');
    assert.equal(g.y,before);assert.equal(g.arc.velocity,velocity);
    assert.ok(g.y>0,'Dino is still airborne when the person returns');
    for(let i=0;i<50;i++) {
      const y=g.y;tick();assert.ok(Math.abs(g.y-y)<20,'no position snap');
    }
    assert.equal(g.y,0);assert.equal(g.triggerCount,1);assert.equal(g.jumps,0);
    assert.ok(events.some(e=>e.event==='dino-jump-landed'));
    return g.snapshot().jumpAnimation;
  };
  const short=run(8),long=run(18);
  assert.ok(short.peakHeight>=64);assert.ok(long.peakHeight>short.peakHeight+10);
  assert.ok(long.peakHeight<=105);assert.ok(long.observedAirMs>short.observedAirMs+250);
});

test('single-frame noise cannot trigger; a held rise cannot auto-repeat; only completed IDs count jumps',()=>{
  const {g,tick}=fixture();
  tick(1);for(let i=0;i<15;i++)tick();
  assert.equal(g.triggerCount,0);assert.equal(g.y,0);
  for(let i=0;i<65;i++)tick(.6);
  assert.equal(g.triggerCount,1);assert.equal(g.y,0);assert.equal(g.jumps,0);
  const completion={id:'jump-1',repIndex:1};
  tick(0,'completed',{completion});tick(0,'completed',{completion});
  assert.equal(g.jumps,1);
});

test('a brief confirmed rise returning during the delay still plays a complete minimum arc',()=>{
  const {g,tick,send}=fixture();
  for(let i=0;i<3;i++)send(.5);
  assert.equal(g.triggerCount,1);assert.equal(g.y,0);assert.equal(g.arc.pending,.03);
  send(0);
  g.step(.029);assert.equal(g.y,0);
  g.step(.01);assert.ok(g.y>0,'takeoff follows the 30 ms buffer');
  for(let i=0;i<10;i++)tick();
  assert.ok(g.y>0);
  for(let i=0;i<40;i++)tick();
  assert.equal(g.y,0);assert.ok(g.arc.peak>=64);assert.equal(g.triggerCount,1);
});

test('pause freezes the trajectory; interrupted movement does not add airtime or snap on resume',()=>{
  const {g,tick,send}=fixture();
  for(let i=0;i<10;i++)tick(.5);
  assert.ok(g.y>0);g.command('pause');
  const height=g.y,velocity=g.arc.velocity,score=g.score;
  for(let i=0;i<50;i++)tick(.7);
  assert.equal(g.y,height);assert.equal(g.arc.velocity,velocity);assert.equal(g.score,score);
  g.command('resume');send(0);assert.equal(g.y,height);
  for(let i=0;i<50;i++)tick();
  assert.equal(g.y,0);assert.equal(g.triggerCount,1);assert.equal(g.lastAirMs,null);
  g.command('pause');g.bindMotionSession({sessionId:'new',source:{kind:'synthetic',id:'new'}});
  assert.equal(g.y,0);assert.equal(g.arc.height,0);assert.equal(g.arc.pending,null);
});

test('foreign, stale, missing and uncalibrated actions cannot trigger animation',()=>{
  const {g,send,tick}=fixture();
  for(let i=0;i<6;i++)send(.8,'active',{sessionId:'foreign'});
  for(let i=0;i<6;i++)send(.8,'active',{calibrated:false});
  for(let i=0;i<6;i++)send(0,'missing');
  for(let i=0;i<6;i++)send(.8,'active',{inputSeq:0,tMs:0});
  for(let i=0;i<10;i++)tick();
  assert.equal(g.triggerCount,0);assert.equal(g.y,0);
});

test('new movements during animation are not queued or stacked; a later grounded cycle can trigger',()=>{
  const {g,tick,events}=fixture();
  for(let i=0;i<8;i++)tick(.5);
  for(let i=0;i<4;i++)tick();
  for(let i=0;i<5;i++)tick(.5);
  assert.equal(g.triggerCount,1);
  assert.equal(events.filter(e=>e.event==='dino-jump-ignored').length,1);
  for(let i=0;i<45;i++)tick();
  assert.equal(g.y,0);assert.equal(g.triggerCount,1);
  for(let i=0;i<8;i++)tick(.5);
  assert.equal(g.triggerCount,2);
});

test('simulation substeps keep animation consistent at 30 and 120 FPS',()=>{
  const run=fps=>{
    const {g,send}=fixture();
    for(let i=0;i<fps*2;i++) {
      if(i%(fps/30)===0)send(i/fps<.5?.5:0);
      g.step(1/fps);
    }
    return g;
  };
  const a=run(30),b=run(120);
  assert.ok(Math.abs(a.arc.peak-b.arc.peak)<.01);
  assert.ok(Math.abs(a.distance-b.distance)<.01);
  assert.equal(a.y,0);assert.equal(b.y,0);
});


test('even a sustained body rise lands within one second of the trigger',()=>{
  const {g,send}=fixture();
  for(let i=0;i<3;i++)send(.5);
  for(let i=0;i<29;i++) { send(.5);g.step(1/30); }
  assert.equal(g.arc.pending,null);assert.equal(g.y,0);
  assert.ok(g.arc.peak>90 && g.arc.peak<105);assert.equal(g.triggerCount,1);
});

test('tracking recovery finishes the existing arc while score and obstacles wait',()=>{
  const {g,tick}=fixture();for(let i=0;i<8;i++)tick(.5);
  g.command('pause');const score=g.score,elapsed=g.elapsed;
  assert.ok(g.y>0);
  for(let i=0;i<40;i++)g.settleJump(1/30);
  assert.equal(g.y,0);assert.equal(g.score,score);assert.equal(g.elapsed,elapsed);
  assert.equal(g.triggerCount,1);assert.equal(g.jumps,0);
});
