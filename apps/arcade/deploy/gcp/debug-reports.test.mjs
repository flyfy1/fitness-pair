import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createDebugReportCollector,DEBUG_RETENTION_MS} from './debug-reports.mjs';

const origin='https://fitness.example.test',id='550e8400-e29b-41d4-a716-446655440000',clipId='650e8400-e29b-41d4-a716-446655440000',sessionId='750e8400-e29b-41d4-a716-446655440000';
const game={id:'motion-quest',title:'Motion Quest'};
const report=(overrides={})=>({version:1,id,consent:'debug-data-v1',trigger:'voice',includeVideo:true,requestedAt:1700000000000,gameId:game.id,sourcePage:'/play/motion-quest',sessionId,
 gameState:{phase:'playing',score:'2 / 5 squats',round:sessionId,source:{kind:'camera',id:sessionId}},
 clip:{id:clipId,sessionId,createdAt:1699999999000,duration:3.2,width:640,height:480,bytes:12,mime:'video/webm',source:'replay',inputSource:{kind:'camera',id:sessionId},stopReason:'Debug report',finalScore:'2 / 5 squats'},
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
