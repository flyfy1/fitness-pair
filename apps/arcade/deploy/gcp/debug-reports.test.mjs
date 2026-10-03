import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createDebugReportCollector,DEBUG_RETENTION_MS} from './debug-reports.mjs';

const origin='https://fitness.example.test',id='550e8400-e29b-41d4-a716-446655440000',clipId='650e8400-e29b-41d4-a716-446655440000',sessionId='750e8400-e29b-41d4-a716-446655440000';
const game={id:'motion-quest',title:'Motion Quest'};
const report=(overrides={})=>({version:1,id,consent:'debug-data-v1',trigger:'voice',includeVideo:true,requestedAt:1700000000000,gameId:game.id,sourcePage:'/play/motion-quest',sessionId,
 gameState:{phase:'playing',score:'2 / 5 squats',round:sessionId,source:{kind:'camera',id:sessionId}},
 clip:{id:clipId,sessionId,createdAt:1699999999000,duration:3.2,width:640,height:480,bytes:24,mime:'video/webm',source:'replay',inputSource:{kind:'camera',id:sessionId},stopReason:'Debug report',finalScore:'2 / 5 squats'},
 tracking:null,client:{locale:'zh-CN',viewport:{width:390,height:844},devicePixelRatio:3},...overrides});
const post=(body=report(),headers={})=>new Request(origin+'/api/debug-reports',{method:'POST',headers:{Origin:origin,Referer:origin+'/play/motion-quest?secret=query','Content-Type':'application/json','User-Agent':'Synthetic Browser 1',Cookie:'private-session',Authorization:'Bearer private-token',...headers},body:JSON.stringify(body)});

test('diagnostic data and explicitly selected video persist privately and idempotently',async t=>{
 const directory=await mkdtemp(tmpdir()+'/hopmodo-debug-');t.after(()=>rm(directory,{recursive:true,force:true}));
 const collector=createDebugReportCollector({directory,origin,games:[game],release:{commit:'verified-debug-build',builtAt:'2026-09-19T00:00:00Z'},now:()=>1700000000100,getUser:async()=>({userId:'a'.repeat(64),email:'player@example.test',csrf:'private-csrf'})});
 let response=await collector.handle(post());assert.equal(response.status,201);assert.equal((await response.json()).video.status,'pending');
 const eventFile=directory+'/debug-reports/events/'+id+'.json';assert.equal((await stat(eventFile)).mode&0o777,0o600);
 let saved=JSON.parse(await readFile(eventFile,'utf8'));assert.equal(saved.trigger,'voice');assert.equal(saved.video.status,'pending');assert.equal(saved.expiresAt,1700000000100+DEBUG_RETENTION_MS);assert.deepEqual(saved.user,{id:'a'.repeat(64),email:'player@example.test'});assert.deepEqual(saved.serviceRelease,{commit:'verified-debug-build',builtAt:'2026-09-19T00:00:00Z'});
 for(const secret of ['private-session','private-token','private-csrf','?secret=query'])assert.equal(JSON.stringify(saved).includes(secret),false);
 const video=Buffer.from([0x1a,0x45,0xdf,0xa3,...Buffer.from('synthetic-webm-debug')]);
 const upload=()=>new Request(origin+'/api/debug-reports/'+id+'/video',{method:'PUT',headers:{Origin:origin,'Content-Type':'video/webm','X-Debug-Video-Consent':'debug-video-v1'},body:video});
 response=await collector.handle(upload());assert.equal(response.status,201);assert.equal((await response.json()).video.bytes,video.length);
 assert.deepEqual(await readdir(directory+'/debug-reports/videos'),[id+'.webm']);saved=JSON.parse(await readFile(eventFile,'utf8'));assert.equal(saved.video.status,'ready');assert.equal(saved.video.bytes,video.length);
 assert.equal((await collector.handle(upload())).status,200);
 await assert.rejects(collector.handle(new Request(origin+'/api/debug-reports/'+id+'/video',{method:'PUT',headers:{Origin:origin,'Content-Type':'video/mp4','X-Debug-Video-Consent':'debug-video-v1'},body:Buffer.from('not-an-mp4')})),{status:415});
 assert.equal((await collector.handle(post(report({trigger:'button'})))).status,200);assert.equal(JSON.parse(await readFile(eventFile,'utf8')).trigger,'voice');
});

test('expired private reports and their selected videos are removed',async t=>{
 const directory=await mkdtemp(tmpdir()+'/hopmodo-debug-');t.after(()=>rm(directory,{recursive:true,force:true}));let clock=1700000000100;
 const collector=createDebugReportCollector({directory,origin,games:[game],now:()=>clock});await collector.handle(post());
 const video=Buffer.from([0x1a,0x45,0xdf,0xa3,...Buffer.from('synthetic-webm-debug')]);await collector.handle(new Request(origin+'/api/debug-reports/'+id+'/video',{method:'PUT',headers:{Origin:origin,'Content-Type':'video/webm','X-Debug-Video-Consent':'debug-video-v1'},body:video}));
 clock+=DEBUG_RETENTION_MS+1;await collector.prune();assert.deepEqual(await readdir(directory+'/debug-reports/events'),[]);assert.deepEqual(await readdir(directory+'/debug-reports/videos'),[]);
});

test('data-only reports reject video while malformed, cross-origin and unconsented uploads fail',async t=>{
 const directory=await mkdtemp(tmpdir()+'/hopmodo-debug-');t.after(()=>rm(directory,{recursive:true,force:true}));
 const collector=createDebugReportCollector({directory,origin,games:[game],now:()=>1700000000100});
 assert.equal((await collector.handle(post(report({includeVideo:false})))).status,201);
 const upload=headers=>new Request(origin+'/api/debug-reports/'+id+'/video',{method:'PUT',headers:{Origin:origin,'Content-Type':'video/webm','X-Debug-Video-Consent':'debug-video-v1',...headers},body:'video'});
 await assert.rejects(collector.handle(upload()),{status:409});
 const invalid=[
  post(report({consent:'automatic'})),post(report({gameId:'unknown'})),post(report({sessionId:'not-a-session'})),
  post(report({tracking:{format:'fitness-pair/tracking-session/1',sessionId,source:{kind:'camera',id:sessionId},samples:[{videoMs:0,pose:{bad:true}}]}})),
  post(report(),{Origin:'https://attacker.test'}),post(report(),{'Content-Type':'text/plain'}),
 ];
 for(const candidate of invalid)await assert.rejects(collector.handle(candidate),error=>[400,403,415].includes(error.status));
 await assert.rejects(collector.handle(upload({'X-Debug-Video-Consent':'automatic'})),{status:400});
});

test('short setup context is retained and malformed recognition timelines fail closed',async t=>{
 const directory=await mkdtemp(tmpdir()+'/hopmodo-debug-context-');t.after(()=>rm(directory,{recursive:true,force:true}));
 const collector=createDebugReportCollector({directory,origin,games:[game],now:()=>1700000000100});
 const diagnostics={format:'fitness-pair/debug-capture/1',durationMs:5000,contexts:[{videoMs:25,inputSeq:5,phase:'setup',recognition:{gesture:{tracked:false,missingJoints:['leftWrist']},start:{stage:'waiting'}}}]};
 assert.equal((await collector.handle(post(report({diagnostics})))).status,201);
 assert.deepEqual(JSON.parse(await readFile(directory+'/debug-reports/events/'+id+'.json','utf8')).diagnostics,diagnostics);
 for(const patch of [{durationMs:90000},{contexts:[null]},{contexts:[{videoMs:-1,inputSeq:0,phase:'setup',recognition:null}]},{contexts:[{videoMs:10,inputSeq:0,phase:'setup'}]},{contexts:[{videoMs:5001,inputSeq:0,phase:'foreign',recognition:{}}]}])await assert.rejects(collector.handle(post(report({diagnostics:{...diagnostics,...patch}}))),{status:400});
});
test('private storage caps include pending videos, serialize concurrent requests and keep retries idempotent',async t=>{
 const directory=await mkdtemp(tmpdir()+'/hopmodo-debug-capacity-');t.after(()=>rm(directory,{recursive:true,force:true}));
 const collector=createDebugReportCollector({directory,origin,games:[game],now:()=>1700000000100,reportLimit:2});
 const second='550e8400-e29b-41d4-a716-446655440001',third='550e8400-e29b-41d4-a716-446655440002';
 const results=await Promise.allSettled([collector.handle(post()),collector.handle(post(report({id:second}))),collector.handle(post(report({id:third})))]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,2);assert.equal(results[2].reason.status,507);
 assert.equal((await collector.handle(post())).status,200);
 const bounded=createDebugReportCollector({directory,origin,games:[game],now:()=>1700000000100,storageLimit:200000});
 await assert.rejects(bounded.handle(post(report({id:third,clip:{...report().clip,bytes:300000}}))),{status:507});
});
test('video limits match the proxy, reserved bytes cannot be exceeded, and expired uploads fail',async t=>{
 const directory=await mkdtemp(tmpdir()+'/hopmodo-debug-video-');t.after(()=>rm(directory,{recursive:true,force:true}));let clock=1700000000100;
 const collector=createDebugReportCollector({directory,origin,games:[game],now:()=>clock});
 await assert.rejects(collector.handle(post(report({clip:{...report().clip,bytes:21*1024*1024}}))),{status:413});
 await collector.handle(post());
 const upload=body=>new Request(origin+'/api/debug-reports/'+id+'/video',{method:'PUT',headers:{Origin:origin,'Content-Type':'video/webm','X-Debug-Video-Consent':'debug-video-v1'},body});
 await assert.rejects(collector.handle(upload(Buffer.alloc(100))),{status:413});
 assert.deepEqual(await readdir(directory+'/debug-reports/videos'),[]);
 clock+=DEBUG_RETENTION_MS+1;await assert.rejects(collector.handle(upload(Buffer.alloc(24))),{status:410});
});
