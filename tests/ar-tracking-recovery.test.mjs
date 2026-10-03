import test from 'node:test';
import assert from 'node:assert/strict';
import {TrackingRecovery,trackingGrace} from '../apps/integ-ar/src/tracking-recovery.js';
const session={sessionId:'fixture',source:{kind:'synthetic',id:'tracking-recovery'}};
function fixture(){
 const recovery=new TrackingRecovery();recovery.reset(session);recovery.begin();let seq=0;
 const observation=(time,options={})=>{
  const frame={...session,inputSeq:++seq,tMs:time,phase:'active',completion:null,
   controls:{leftLowered:true,leftRaised:false,rightRaised:false},...options.frame};
  const hands={inputSeq:seq,tracked:true,neutral:true,...options.hands};
  return recovery.observe(frame,hands,options.now??time);
 };
 return {recovery,observation};
}
test('short loss keeps controls held until the 1.5-second capture-time grace expires',()=>{
 assert.deepEqual(trackingGrace(100,200),{holding:false,expired:false,remainingMs:1400});
 assert.deepEqual(trackingGrace(100,350),{holding:true,expired:false,remainingMs:1250});
 assert.equal(trackingGrace(100,1599).expired,false);assert.equal(trackingGrace(100,1600).expired,true);
 assert.equal(trackingGrace(100,3000).expired,true);
 assert.equal(trackingGrace(1400,1500).holding,false);
 for(const [last,now] of [[-Infinity,100],[NaN,100],[100,NaN],[200,100]])assert.equal(trackingGrace(last,now).expired,true);
});
test('500 ms of neutral observations precede a 1.5-second countdown and one ready state',()=>{
 const {recovery,observation}=fixture();
 for(let t=0;t<500;t+=50)assert.equal(observation(t).status,'steady');
 assert.deepEqual(observation(500),{status:'countdown',remainingMs:1500});
 for(let t=550;t<2000;t+=50)assert.equal(observation(t).status,'countdown');
 assert.equal(observation(2000).status,'ready');recovery.cancel();
 assert.equal(observation(2050).status,'inactive');
});
test('silent gaps and render time cannot finish or preserve a recovery countdown',()=>{
 const {recovery,observation}=fixture();
 for(let t=0;t<=500;t+=50)observation(t);
 assert.equal(recovery.read(650).remainingMs,1500);
 assert.equal(recovery.read(750).status,'tracking');
 assert.equal(observation(2000).status,'steady');
 for(let t=2050;t<=2500;t+=50)observation(t);
 assert.equal(recovery.read(2600).remainingMs,1500);
 assert.equal(observation(3000).status,'steady');
});
test('missing, calibrating, raised or unobserved hands reset readiness instead of resuming',()=>{
 for(const options of [{frame:{phase:'missing'}},{frame:{phase:'calibrating'}},{hands:{neutral:false}},
  {hands:{tracked:false}},{hands:{inputSeq:999}},{frame:{completion:{id:'unseen',repIndex:1}}},
  {frame:{controls:{leftLowered:false}}}]){
  const {observation}=fixture();for(let t=0;t<=1800;t+=100)observation(t);
  assert.notEqual(observation(1850,options).status,'ready');
  assert.equal(observation(1900).status,'steady');
  assert.equal(observation(2000).status,'steady');
 }
});
test('foreign, stale, duplicate and future frames cannot advance readiness',()=>{
 const {recovery,observation}=fixture();for(let t=0;t<=500;t+=50)observation(t);
 const before=recovery.read(500);
 for(const frame of [{sessionId:'other'},{source:{kind:'camera',id:'wrong'}},{source:null},{inputSeq:1},{tMs:450}]){
  assert.deepEqual(observation(550,{frame}),before);
 }
 assert.equal(observation(600,{now:850}).status,'tracking');
 assert.equal(observation(900,{now:899}).status,'tracking');
 assert.equal(observation(1000).status,'steady');
});
test('cancel and a new camera session discard countdown and old provenance',()=>{
 const {recovery,observation}=fixture();for(let t=0;t<=1800;t+=100)observation(t);
 recovery.cancel();assert.equal(observation(2000).status,'inactive');
 recovery.begin();assert.equal(observation(2050).status,'steady');
 recovery.reset({...session,sessionId:'new'});recovery.begin();
 assert.equal(observation(2100).status,'tracking');
});
