import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createFeedbackCollector} from './feedback.mjs';

const origin='https://fitness.example.test';
const game={id:'motion-quest',title:'Motion Quest'};
const id='550e8400-e29b-41d4-a716-446655440000';
const body=(overrides={})=>({version:1,id,rating:'up',gameId:game.id,sourcePage:'/play/motion-quest',durationMs:3210,stoppedAt:1700000000000,inputSource:'synthetic',score:'2 / 5 squats',...overrides});
const request=(value=body(),headers={})=>new Request(origin+'/api/feedback',{method:'POST',headers:{Origin:origin,Referer:origin+'/play/motion-quest?private=query','Content-Type':'application/json','User-Agent':'Synthetic Browser 1','Sec-Fetch-Site':'same-origin',Cookie:'private-session',Authorization:'Bearer private-token',...headers},body:JSON.stringify(value)});

test('feedback stores bounded game and request facts with an authenticated account but no credentials',async t=>{
 const directory=await mkdtemp(tmpdir()+'/hopmodo-feedback-');t.after(()=>rm(directory,{recursive:true,force:true}));
 const collector=createFeedbackCollector({directory,origin,games:[game],now:()=>1700000000100,getUser:async()=>({userId:'a'.repeat(64),email:'player@example.test',csrf:'private-csrf'})});
 const response=await collector.handle(request());assert.equal(response.status,201);
 assert.deepEqual(await response.json(),{ok:true,id,receivedAt:1700000000100});
 const files=await readdir(directory+'/feedback/events');assert.deepEqual(files,[id+'.json']);
 assert.equal((await stat(directory+'/feedback/events/'+files[0])).mode&0o777,0o600);
 const saved=JSON.parse(await readFile(directory+'/feedback/events/'+files[0],'utf8'));
 assert.deepEqual(saved.game,{id:'motion-quest',title:'Motion Quest',inputSource:'synthetic',score:'2 / 5 squats'});
 assert.equal(saved.durationMs,3210);assert.equal(saved.sourcePage,'/play/motion-quest');
 assert.deepEqual(saved.request,{origin,referer:'/play/motion-quest',userAgent:'Synthetic Browser 1',secFetchSite:'same-origin'});
 assert.deepEqual(saved.user,{id:'a'.repeat(64),email:'player@example.test'});
 for(const secret of ['private-session','private-token','private-csrf','?private=query'])assert.equal(JSON.stringify(saved).includes(secret),false);
 const retry=await collector.handle(request(body({rating:'down'})));assert.equal(retry.status,201);
 assert.equal((await readdir(directory+'/feedback/events')).length,1);
 assert.equal(JSON.parse(await readFile(directory+'/feedback/events/'+files[0],'utf8')).rating,'up');
});

test('anonymous feedback is accepted while invalid origins, games, ratings, durations and oversized bodies are rejected',async t=>{
 const directory=await mkdtemp(tmpdir()+'/hopmodo-feedback-');t.after(()=>rm(directory,{recursive:true,force:true}));
 const collector=createFeedbackCollector({directory,origin,games:[game],now:()=>1700000000100});
 assert.equal((await collector.handle(request(body(),{'User-Agent':'Anonymous Browser'}))).status,201);
 const cases=[
  [request(body({id:'bad'})),400],
  [request(body({gameId:'unknown'})),400],
  [request(body({rating:'maybe'})),400],
  [request(body({durationMs:-1})),400],
  [request(body({sourcePage:'/private'})),400],
  [request(body({inputSource:'hardware-serial'})),400],
  [request(body(),{Origin:'https://attacker.test'}),403],
  [request(body(),{'Content-Type':'application/jsonp'}),415],
  [new Request(origin+'/api/feedback',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"padding":"'+('x'.repeat(5000))+'"}'}),413],
 ];
 for(const [candidate,status] of cases)await assert.rejects(collector.handle(candidate),{status});
 const saved=JSON.parse(await readFile(directory+'/feedback/events/'+id+'.json','utf8'));assert.equal(saved.user,null);
});
