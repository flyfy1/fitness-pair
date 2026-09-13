import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
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
    assert.equal((await fetch(origin+'/api/unknown')).status,404);
    const head=await fetch(origin+'/healthz',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
