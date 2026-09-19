import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayTracker} from '../apps/arcade/src/gameplay/play-stats.js';
test('tracking excludes setup, pause and hidden time, counts completion once and handles restart',()=>{
 let clock=0;const sent=[];const tracker=createPlayTracker({gameId:'one',playerId:'player',send:x=>sent.push(x),now:()=>100000+clock,clock:()=>clock,uuid:()=>`round-${sent.length}`});
 const frame=phase=>({round:1,phase,source:{kind:'synthetic'}});
 tracker.observe(frame('setup'));assert.equal(sent.length,0);
 tracker.observe(frame('playing'));clock+=1000;tracker.observe(frame('paused'));clock+=1500;tracker.observe(frame('playing'));clock+=500;tracker.visibility(false);clock+=30000;tracker.observe(frame('playing'),false);tracker.visibility(true);clock+=500;tracker.observe(frame('complete'));tracker.observe(frame('complete'));tracker.finish('left');
 assert.equal(sent.at(-1).activeMs,2000);assert.equal(sent.at(-1).endReason,'completed');assert.equal(sent.filter(r=>r.endReason==='completed').length,1);
 tracker.observe({round:2,phase:'playing'});clock+=500;tracker.observe({round:3,phase:'playing'});assert.equal(sent.at(-2).endReason,'restarted');tracker.finish('stopped');assert.equal(sent.at(-1).endReason,'stopped');
});
