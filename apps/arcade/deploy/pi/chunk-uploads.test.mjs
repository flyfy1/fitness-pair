import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {chunkedWorker} from './chunk-uploads.mjs';
const origin='https://fitness.integ.life',id='12345678-1234-4234-8234-123456789abc';
const query='?title=Synthetic&game=motion-quest&source=synthetic&duration=1&visibility=public&retention=7';
const headers={'Origin':origin,'Content-Type':'video/mp4','X-Sharing-Consent':'gallery-v1','X-Management-Key':'x'.repeat(32),'X-Upload-Bytes':'16'};
const request=(path,method='POST',extra={},body)=>new Request(origin+path,{method,headers:{...headers,...extra},...(body?{body}:{} )});
const env={GCP_BUCKET:'test',ACCOUNTS:{user:async()=>null,requireUser:async()=>{throw Error('unexpected');}}};

test('chunks preserve bytes and consent and invoke original publishing only when complete',async()=>{
 const dir=await mkdtemp(tmpdir()+'/fitness-chunks-');let calls=0;
 const adapter=await chunkedWorker({fetch:async(req)=>{
  calls++;assert.equal(req.url,origin+'/api/clips/'+id+query);
  assert.equal(req.headers.get('X-Sharing-Consent'),'gallery-v1');
  assert.equal(req.headers.get('Content-Length'),'16');
  assert.deepEqual(new Uint8Array(await req.arrayBuffer()),new Uint8Array(16).fill(7));
  return Response.json({published:true}, {status:201});
 }},{directory:dir});
 try{
  const start=await adapter.fetch(request('/api/chunk-uploads/'+id+query),env);assert.equal(start.status,201);
  const path='/api/chunk-uploads/'+(await start.json()).id;
  assert.equal((await adapter.fetch(request(path+'/commit'),env)).status,409);assert.equal(calls,0);
  assert.equal((await adapter.fetch(request(path,'PUT',{'X-Upload-Offset':'0','X-Management-Key':'y'.repeat(32)},new Uint8Array(8)),env)).status,404);
  for(const offset of [0,8])assert.equal((await adapter.fetch(request(path,'PUT',{'X-Upload-Offset':String(offset)},new Uint8Array(8).fill(7)),env)).status,200);
  assert.equal((await adapter.fetch(request(path+'/commit'),env)).status,201);assert.equal(calls,1);
  assert.equal((await adapter.fetch(request(path+'/commit'),env)).status,404);
 }finally{adapter.close();await rm(dir,{recursive:true,force:true});}
});

test('origin, consent, expiry, size, concurrency and chunk overflow fail closed',async()=>{
 const dir=await mkdtemp(tmpdir()+'/fitness-chunks-');let now=0;
 const adapter=await chunkedWorker({fetch:async()=>{throw Error('Must not publish');}},{directory:dir,now:()=>now});
 const path='/api/chunk-uploads/'+id+query;
 try{
  for(const [extra,status] of [[{Origin:'https://evil.invalid'},403],[{'X-Sharing-Consent':'wrong'},400],[{'X-Upload-Bytes':'200000001'},413],[{'X-CSRF-Token':'expired'},401]]){
   assert.equal((await adapter.fetch(request(path,'POST',extra),env)).status,status);
  }
  const start=await adapter.fetch(request(path),env),upload='/api/chunk-uploads/'+(await start.json()).id;
  assert.equal((await adapter.fetch(request(path),env)).status,429);
  assert.equal((await adapter.fetch(request(upload,'PUT',{'X-Upload-Offset':'0'},new Uint8Array(17)),env)).status,413);
  assert.equal((await adapter.fetch(request(upload+'/commit'),env)).status,404);
  const next=await adapter.fetch(request(path),env),expired='/api/chunk-uploads/'+(await next.json()).id;
  now=600001;assert.equal((await adapter.fetch(request(expired+'/commit'),env)).status,404);
 }finally{adapter.close();await rm(dir,{recursive:true,force:true});}
});
