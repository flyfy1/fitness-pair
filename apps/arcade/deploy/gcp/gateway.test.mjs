import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createGateway} from './gateway.mjs';

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
