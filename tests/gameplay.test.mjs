import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionController} from '../packages/gameplay/input.js';
import {createNativeAdapter} from '../apps/arcade/src/gameplay/runtime.js';
import {Runner} from '../apps/dino-run/src/engine.js';
import {createRunnerMotionInput} from '../apps/dino-run/src/motion-input.js';

const session={sessionId:'input-one',source:{kind:'synthetic',id:'generated-input'}};
const action=(seq,overrides={})=>({version:1,...session,inputSeq:seq,tMs:seq*40,recognizerId:'synthetic-control',action:'jump-height',phase:'active',cue:'ready',progress:.5,calibrationProgress:null,completion:null,heightRatio:.5,calibrated:true,stage:'ready',...overrides});

test('a game runs with direct controls or optional recognition without changing physics',()=>{
 const direct=new Runner(),recognized=new Runner();
 for(const game of [direct,recognized]){game.setControlMode('motion');game.command('start');game.spawnIn=100;}
 const input=createRunnerMotionInput(recognized);input.reset(session);
 for(const [i,height] of [.2,.8,.3,0].entries()){
  direct.setHeightRatio(height);input.consume(action(i+1,{heightRatio:height}));
  direct.step(.04);recognized.step(.04);assert.deepEqual(direct.snapshot(),recognized.snapshot());
 }
 input.dispose();assert.equal(input.consume(action(9)),false);
 recognized.setControlMode('keyboard');recognized.command('start');assert.equal(recognized.command('jump'),true);
});

test('input mappings preserve frame identity, reject foreign/stale sources and deduplicate completions',()=>{
 const applied=[];const input=createActionController({action:'jump-height',apply:(frame,flags)=>applied.push([frame,flags])});input.reset(session);
 const frame=action(1,{phase:'completed',completion:{id:'once',repIndex:1}});assert.equal(input.consume(frame),true);assert.equal(applied[0][0],frame);assert.equal(applied[0][1].completed,true);
 assert.equal(input.consume(action(2,{phase:'completed',completion:{id:'once',repIndex:1}})),true);assert.equal(applied[1][1].completed,false);
 assert.equal(input.consume(action(2)),false);
 assert.equal(input.consume(action(3,{source:{kind:'camera',id:'generated-input'}})),false);
 assert.equal(input.consume(action(3,{sessionId:'other'})),false);
 assert.equal(input.consume(action(3,{action:'squat'})),false);
 assert.equal(applied.length,2);
 input.reset({...session,sessionId:'input-two'});assert.equal(input.consume(action(4)),false);
 assert.equal(input.consume(action(1,{sessionId:'input-two',recognizerId:'replacement-recognizer'})),true);
});

test('native presentation adapters reconnect and dispose without game-specific knowledge',()=>{
 const frame=new EventTarget();frame.contentDocument={readyState:'complete'};
 let state={round:1,phase:'setup',canvas:{width:1280,height:800},score:'0'},notify,notifyTracking,cleanups=0,trackingCleanups=0,host;
 frame.contentWindow={gameplay:{getFrame:()=>state,subscribe:callback=>{notify=callback;return()=>cleanups++;},subscribeTracking:callback=>{notifyTracking=callback;return()=>trackingCleanups++;},configureHost:options=>{host=options;}}};
 const runtime=createNativeAdapter(frame);let changes=0;const tracked=[];runtime.subscribe(()=>changes++);runtime.subscribeTracking(value=>tracked.push(value));
 runtime.configureHost({homeURL:'/',recordingNote:'Local replay'});assert.equal(host.homeURL,'/');
 state={...state,phase:'playing'};notify();notifyTracking({seq:1});assert.equal(changes,1);assert.deepEqual(tracked,[{seq:1}]);assert.equal(runtime.readFrame(),state);
 frame.dispatchEvent(new Event('load'));assert.equal(cleanups,1);assert.equal(trackingCleanups,1);assert.equal(changes,2);
 runtime.dispose();assert.equal(cleanups,2);assert.equal(trackingCleanups,2);assert.equal(runtime.readFrame(),null);
 frame.dispatchEvent(new Event('load'));assert.equal(cleanups,2);
});
