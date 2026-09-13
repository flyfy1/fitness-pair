import test from 'node:test';
import assert from 'node:assert/strict';
import {InvadersTutorial} from '../apps/integ-ar/src/invaders-tutorial.js';
const session={sessionId:'practice',source:{kind:'synthetic',id:'tutorial-test'}};
function harness(){const tutorial=new InvadersTutorial();tutorial.reset(session);let seq=0,time=0;const frame=(horizontal=0,extra={})=>({version:1,...session,inputSeq:++seq,tMs:time+=100,recognizerId:'body-arcade-v1',action:'body-arcade',phase:'active',progress:0,calibrationProgress:null,completion:null,cue:'test',controls:{horizontal,leftLowered:true,leftRaised:false,rightRaised:false},...extra});const hold=(x)=>{for(let i=0;i<4;i++)tutorial.update(frame(x));};return{tutorial,frame,hold};}
test('practice confirms both directions, a completion event, and observed hand lowering in order',()=>{
 const {tutorial:t,frame,hold}=harness();hold(.8);assert.equal(t.step,'left');hold(-.6);assert.equal(t.step,'right');hold(.6);assert.equal(t.step,'fire');
 t.update(frame(0,{controls:{horizontal:0,leftRaised:true,leftLowered:false}}));assert.equal(t.step,'fire');
 t.update(frame(0,{phase:'completed',completion:{id:'practice:body:1',repIndex:1},controls:{horizontal:0,leftRaised:true,leftLowered:false}}));assert.equal(t.step,'lower');
 for(let i=0;i<4;i++)t.update(frame(0,{controls:{horizontal:0,leftRaised:false,leftLowered:false}}));assert.equal(t.step,'lower');hold(0);assert.equal(t.completed,true);
});
test('missing poses and inference gaps reset hold duration without erasing confirmed steps',()=>{
 const {tutorial:t,frame,hold}=harness();t.update(frame(-.6));t.update(frame(-.6));t.update(frame(0,{phase:'missing'}));t.update(frame(-.6));assert.equal(t.step,'left');hold(-.6);assert.equal(t.step,'right');
 const afterGap=frame(.6);afterGap.tMs+=1000;t.update(afterGap);assert.equal(t.step,'right');assert.equal(t.progress,0);
});
test('duplicate, foreign and early shots cannot confirm another training step',()=>{
 const {tutorial:t,frame,hold}=harness();const f=frame(-.9);t.update(f);t.update({...f,tMs:10000});assert.equal(t.step,'left');
 t.update({...frame(-.9),sessionId:'other'});assert.equal(t.step,'left');
 t.update(frame(0,{phase:'completed',completion:{id:'early',repIndex:1}}));assert.equal(t.step,'left');hold(-.6);hold(.6);assert.equal(t.step,'fire');
 t.update(frame(0,{phase:'completed',completion:{id:'early',repIndex:1}}));assert.equal(t.step,'fire');
 t.update(frame(0,{phase:'completed',completion:{id:'both',repIndex:2},controls:{horizontal:0,rightRaised:true}}));assert.equal(t.step,'fire');
});
