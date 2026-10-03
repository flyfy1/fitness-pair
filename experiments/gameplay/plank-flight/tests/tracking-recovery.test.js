import test from 'node:test';
import assert from 'node:assert/strict';
import {TrackingGate} from '../src/tracking-gate.js';
import {createFlight,stepFlight} from '../src/engine.js';
import {FlightAudio} from '../src/audio.js';

test('loss expires 1.5 seconds after the last valid capture, not repeated missing results',()=>{
 const gate=new TrackingGate();gate.reset(100);
 assert.equal(gate.observe(false,200).expired,false);
 for(let t=250;t<1600;t+=50)assert.equal(gate.observe(false,t).expired,false);
 assert.deepEqual(gate.status(1600),{held:true,expired:true});
 assert.equal(gate.observe(false,1700).expired,true);
});

test('stale/future results and silence cannot extend grace or advance recovery',()=>{
 const gate=new TrackingGate();gate.reset(0);gate.observe(false,50);
 assert.equal(gate.observe(true,100,500).held,true);
 assert.equal(gate.observe(true,1800,1500).expired,true);
 gate.observe(true,1600);assert.equal(gate.status(2000).held,true);
 // A new capture after a silent gap starts another hold instead of counting unseen time.
 assert.equal(gate.observe(true,2100).held,true);
 gate.observe(true,2200);assert.equal(gate.observe(true,2300).held,false);
 gate.observe(false,2350);gate.observe(true,2400);gate.observe(false,2450);
 assert.equal(gate.observe(true,2600).held,true);
 assert.equal(gate.observe(true,2800).held,false);
});

test('isolated good frames cannot keep the world running while controls remain held',()=>{
 const gate=new TrackingGate();gate.reset(0);gate.observe(false,50);
 for(const time of [500,1000,1500])assert.equal(gate.observe(true,time).held,true);
 assert.equal(gate.status(1500).expired,true);
 gate.observe(true,1600);assert.deepEqual(gate.observe(true,1700),{held:false,expired:false});
});

test('a tracking pause freezes countdown, obstacles, score, acceleration and collision debounce',()=>{
 for(const phase of ['countdown','flying']){
  const state=createFlight({sessionId:'synthetic-fixture',source:{kind:'synthetic',id:'grace'}});
  Object.assign(state,{status:'paused',countdownSeconds:1.2,flightSeconds:5,passed:2,speedGain:.3,
   collisionSeconds:.1,trackingHeld:true,obstacles:[{x:.5,gap:.7,counted:false}]});
  const before=structuredClone(state);
  for(let t=0;t<5000;t+=50)stepFlight(state,.05,t);
  assert.deepEqual(state,before);
  state.status=phase;stepFlight(state,.05,5050);
  if(phase==='countdown')assert.ok(state.countdownSeconds>before.countdownSeconds);
  else assert.ok(state.flightSeconds>before.flightSeconds);
 }
});

test('resuming flight preserves audio session and does not repeat the takeoff cue',()=>{
 const audio=new FlightAudio(),cues=[];let stops=0;
 audio.cue=name=>cues.push(name);audio.stop=()=>{stops++;};
 const state={sessionId:'round',status:'countdown',countdownSeconds:0,passed:0,flightSeconds:0};
 audio.update(state,1);state.status='flying';audio.update(state,1);
 state.status='paused';audio.update(state,1);state.status='flying';audio.update(state,1);
 assert.deepEqual(cues,['three','start']);assert.equal(stops,1);assert.equal(audio.session,'round');
 state.sessionId='new-round';audio.update(state,1);assert.deepEqual(cues,['three','start','start']);
 audio.dispose();
});
