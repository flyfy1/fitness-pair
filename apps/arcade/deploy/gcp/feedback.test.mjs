import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createFeedbackCollector,FEEDBACK_RETENTION_MS} from './feedback.mjs';

const origin='https://fitness.example.test';
const game={id:'motion-quest',title:'Motion Quest'};
const id='550e8400-e29b-41d4-a716-446655440000';
const body=(overrides={})=>({version:1,id,rating:'up',gameId:game.id,sourcePage:'/play/motion-quest',durationMs:3210,stoppedAt:1700000000000,endReason:'stopped',inputSource:'synthetic',score:'2 / 5 squats',...overrides});
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
 assert.equal(saved.durationMs,3210);assert.equal(saved.endReason,'stopped');assert.equal(saved.sourcePage,'/play/motion-quest');
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
  [request(body({endReason:'closed'})),400],
  [request(body({sourcePage:'/private'})),400],
  [request(body({inputSource:'hardware-serial'})),400],
  [request(body(),{Origin:'https://attacker.test'}),403],
  [request(body(),{'Content-Type':'application/jsonp'}),415],
  [new Request(origin+'/api/feedback',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"padding":"'+('x'.repeat(5000))+'"}'}),413],
 ];
 for(const [candidate,status] of cases)await assert.rejects(collector.handle(candidate),{status});
 const saved=JSON.parse(await readFile(directory+'/feedback/events/'+id+'.json','utf8'));assert.equal(saved.user,null);
});

test('feedback storage is capped, expires after retention and keeps legacy records counted',async t=>{
 const directory=await mkdtemp(tmpdir()+'/hopmodo-feedback-cap-');t.after(()=>rm(directory,{recursive:true,force:true}));let clock=1700000000100;
 const ids=['550e8400-e29b-41d4-a716-446655440001','550e8400-e29b-41d4-a716-446655440002','550e8400-e29b-41d4-a716-446655440003'];
 const collector=createFeedbackCollector({directory,origin,games:[game],now:()=>clock,eventLimit:2});
 const results=await Promise.allSettled(ids.map(value=>collector.handle(request(body({id:value,stoppedAt:clock})))));
 assert.equal(results.filter(result=>result.status==='fulfilled').length,2);assert.equal(results[2].reason.status,507);
 assert.equal((await collector.handle(request(body({id:ids[0],stoppedAt:clock})))).status,201);
 const saved=JSON.parse(await readFile(directory+'/feedback/events/'+ids[0]+'.json','utf8'));assert.equal(saved.expiresAt,saved.receivedAt+FEEDBACK_RETENTION_MS);
 clock+=FEEDBACK_RETENTION_MS+1;
 assert.equal((await collector.handle(request(body({id:ids[2],stoppedAt:clock})))).status,201);
 assert.deepEqual(await readdir(directory+'/feedback/events'),[ids[2]+'.json']);
 // A record from before retention existed is counted by the startup scan and never expires automatically.
 await writeFile(directory+'/feedback/events/'+ids[0]+'.json',JSON.stringify({version:1,id:ids[0],receivedAt:1}),{mode:0o600});
 const restarted=createFeedbackCollector({directory,origin,games:[game],now:()=>clock,eventLimit:2});
 await assert.rejects(restarted.handle(request(body({id:ids[1],stoppedAt:clock}))),{status:507});
 clock+=FEEDBACK_RETENTION_MS+1;await restarted.prune();
 assert.deepEqual(await readdir(directory+'/feedback/events'),[ids[0]+'.json']);
});

test('feedback uses a cached tally between periodic rescans',async t=>{
 const directory=await mkdtemp(tmpdir()+'/hopmodo-feedback-tally-');t.after(()=>rm(directory,{recursive:true,force:true}));
 const collector=createFeedbackCollector({directory,origin,games:[game],now:()=>1700000000100,eventLimit:2});
 assert.equal((await collector.handle(request())).status,201);
 const other='550e8400-e29b-41d4-a716-446655440009';
 await writeFile(directory+'/feedback/events/'+other+'.json',JSON.stringify({version:1,id:other}),{mode:0o600});
 assert.equal((await collector.handle(request(body({id:'550e8400-e29b-41d4-a716-446655440008'})))).status,201);
 await collector.prune();
 await assert.rejects(collector.handle(request(body({id:'550e8400-e29b-41d4-a716-446655440007'}))),{status:507});
});
