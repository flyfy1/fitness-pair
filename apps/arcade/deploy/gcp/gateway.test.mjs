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
    assert.equal((await fetch(origin+'/api/unknown')).status,404);
    const head=await fetch(origin+'/healthz',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
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
