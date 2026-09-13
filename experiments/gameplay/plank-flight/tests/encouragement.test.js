import test from 'node:test';
import assert from 'node:assert/strict';
import {encouragementPack,createEncouragementSchedule} from '../src/encouragement.js';

test('encouragement waits for completed gate groups and a cooldown, ignoring duplicate updates',()=>{
 const schedule=createEncouragementSchedule(()=>0);schedule.reset();
 assert.equal(schedule.milestone(1,20),null);
 assert.equal(schedule.milestone(2,11),null);
 assert.ok(schedule.milestone(3,12));
 assert.equal(schedule.milestone(3,30),null);
 assert.equal(schedule.milestone(4,30),null);
 assert.ok(schedule.milestone(5,30));
 assert.equal(schedule.milestone(7,35),null);
 assert.equal(schedule.milestone(7,50),null);
 assert.ok(schedule.milestone(8,50));
});

test('random intervals reach five gates; mute skips encouragement without replaying it later',()=>{
 const schedule=createEncouragementSchedule(()=>.999);schedule.reset();
 for(let gate=1;gate<5;gate++)assert.equal(schedule.milestone(gate,gate*15),null);
 assert.equal(schedule.milestone(5,75,false),null);
 for(let gate=6;gate<10;gate++)assert.equal(schedule.milestone(gate,gate*15),null);
 assert.ok(schedule.milestone(10,150));
 schedule.reset();assert.equal(schedule.milestone(1,200),null);
});

test('eighteen distinct scripts shuffle without replacement or immediate bag-boundary repeats',()=>{
 assert.equal(encouragementPack.clips.length,18);
 assert.equal(new Set(encouragementPack.clips.map(x=>x.text)).size,18);
 const schedule=createEncouragementSchedule(()=>.4);schedule.reset();
 const milestone=[];for(let gate=1;milestone.length<13;gate++){
  const clip=schedule.milestone(gate,gate*15);if(clip)milestone.push(clip.id);
 }
 assert.equal(new Set(milestone.slice(0,12)).size,12);assert.notEqual(milestone[11],milestone[12]);
 const endings=Array.from({length:7},()=>schedule.finish().id);
 assert.equal(new Set(endings.slice(0,6)).size,6);assert.notEqual(endings[5],endings[6]);
});
