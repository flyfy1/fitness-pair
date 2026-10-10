import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createGateway,createRateLimiter,clientKey} from './gateway.mjs';

test('GCP gateway reports its release, preserves disabled gallery and rejects uploads',async()=>{
  const server=createGateway({release:{commit:'verified-test-commit'}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(origin+'/healthz')).json(),{ok:true,service:'fitness-arcade',commit:'verified-test-commit'});
    assert.deepEqual(await (await fetch(origin+'/api/config')).json(),{sharingEnabled:false});
    assert.deepEqual(await (await fetch(origin+'/api/clips')).json(),{enabled:false,clips:[]});
    const upload=await fetch(origin+'/api/clips/550e8400-e29b-41d4-a716-446655440000',{method:'PUT',body:'not a video'});
    assert.equal(upload.status,503);
    assert.equal((await fetch(origin+'/api/feedback',{method:'POST'})).status,503);
    assert.equal((await fetch(origin+'/api/debug-reports',{method:'POST'})).status,503);
    assert.equal((await fetch(origin+'/api/unknown')).status,404);
    const head=await fetch(origin+'/healthz',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('GCP gateway routes same-origin diagnostic reports to private durable state',async t=>{
  const directory=await mkdtemp(tmpdir()+'/hopmodo-debug-gateway-');t.after(()=>rm(directory,{recursive:true,force:true}));
  const origin='http://127.0.0.1';const server=createGateway({origin,env:{FITNESS_STATE_DIR:directory}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const id='550e8400-e29b-41d4-a716-446655440000',sessionId='750e8400-e29b-41d4-a716-446655440000';
  const body={version:1,id,consent:'debug-data-v1',trigger:'button',includeVideo:false,requestedAt:Date.now(),gameId:'motion-quest',sourcePage:'/play/motion-quest',sessionId,gameState:{phase:'playing',score:'1 / 5 squats',round:sessionId,source:{kind:'camera',id:sessionId}},clip:{id:'650e8400-e29b-41d4-a716-446655440000',sessionId,createdAt:Date.now()-1000,duration:1,width:640,height:480,bytes:100,mime:'video/webm',source:'replay',inputSource:{kind:'camera',id:sessionId},stopReason:'Debug report',finalScore:'1 / 5 squats'},tracking:null,client:{locale:'en',viewport:{width:390,height:844},devicePixelRatio:2}};
  try{const response=await fetch(base+'/api/debug-reports',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,201);assert.deepEqual(await readdir(directory+'/debug-reports/events'),[id+'.json']);}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('GCP gateway routes same-origin feedback to durable state',async t=>{
  const directory=await mkdtemp(tmpdir()+'/hopmodo-feedback-gateway-');t.after(()=>rm(directory,{recursive:true,force:true}));
  const server=createGateway({origin:'http://127.0.0.1',env:{FITNESS_STATE_DIR:directory}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(base+'/api/feedback',{method:'POST',headers:{Origin:'http://127.0.0.1','Content-Type':'application/json'},body:JSON.stringify({version:1,id:'550e8400-e29b-41d4-a716-446655440000',rating:'up',gameId:'motion-quest',sourcePage:'/play/motion-quest',durationMs:5000,stoppedAt:Date.now(),endReason:'completed',inputSource:'synthetic',score:'1 / 5 squats'})});
    assert.equal(response.status,201);assert.deepEqual(await readdir(directory+'/feedback/events'),['550e8400-e29b-41d4-a716-446655440000.json']);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('rate limiter bounds each client and the whole endpoint, then resets after its window',()=>{
  let clock=0;
  const rules=[{name:'feedback',match:(method,pathname)=>method==='POST'&&pathname==='/api/feedback',perClient:{limit:2,windowMs:1000},global:{limit:3,windowMs:1000}}];
  const limiter=createRateLimiter({rules,now:()=>clock,maxKeys:3});
  assert.equal(limiter.check('POST','/api/feedback','a'),0);assert.equal(limiter.check('POST','/api/feedback','a'),0);
  assert.equal(limiter.check('POST','/api/feedback','a'),1);
  assert.equal(limiter.check('GET','/api/feedback','a'),0);assert.equal(limiter.check('POST','/api/clips','a'),0);
  assert.equal(limiter.check('POST','/api/feedback','b'),0);assert.equal(limiter.check('POST','/api/feedback','c'),1);
  clock=1000;assert.equal(limiter.check('POST','/api/feedback','a'),0);
  for(const client of ['d','e','f','g'])limiter.check('POST','/api/feedback',client);
  assert.equal(clientKey({headers:{'cf-connecting-ip':' 203.0.113.7 '},socket:{remoteAddress:'127.0.0.1'}}),'203.0.113.7');
  assert.equal(clientKey({headers:{},socket:{remoteAddress:'127.0.0.1'}}),'127.0.0.1');
  assert.equal(clientKey({headers:{'cf-connecting-ip':'x'.repeat(65)},socket:{remoteAddress:'::1'}}),'::1');
});

test('GCP gateway rate limits anonymous writes per CF-Connecting-IP before storage',async t=>{
  const directory=await mkdtemp(tmpdir()+'/hopmodo-rate-gateway-');t.after(()=>rm(directory,{recursive:true,force:true}));
  const rules=[{name:'feedback',match:(method,pathname)=>method==='POST'&&pathname==='/api/feedback',perClient:{limit:1,windowMs:60000},global:{limit:10,windowMs:60000}}];
  const server=createGateway({origin:'http://127.0.0.1',env:{FITNESS_STATE_DIR:directory},rateLimiter:createRateLimiter({rules})});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const send=(client,id)=>fetch(base+'/api/feedback',{method:'POST',headers:{Origin:'http://127.0.0.1','Content-Type':'application/json','CF-Connecting-IP':client},body:JSON.stringify({version:1,id,rating:'up',gameId:'motion-quest',sourcePage:'/play/motion-quest',durationMs:5000,stoppedAt:Date.now(),endReason:'completed',inputSource:'synthetic',score:null})});
  try{
    assert.equal((await send('203.0.113.1','550e8400-e29b-41d4-a716-446655440000')).status,201);
    const limited=await send('203.0.113.1','550e8400-e29b-41d4-a716-446655440001');
    assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('Retry-After'))>0);
    assert.equal((await send('203.0.113.2','550e8400-e29b-41d4-a716-446655440002')).status,201);
    assert.deepEqual((await readdir(directory+'/feedback/events')).sort(),['550e8400-e29b-41d4-a716-446655440000.json','550e8400-e29b-41d4-a716-446655440002.json']);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
