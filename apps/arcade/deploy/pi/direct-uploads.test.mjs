import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {directUploadWorker} from './direct-uploads.mjs';
import {createWorker} from '../../server/worker.js';
import {createAccountStore} from '../gcp/account-store.mjs';
import {decodeUpload} from '../../server/testing/gcs-upload.mjs';
const origin='https://fitness.integ.life',id='12345678-1234-4234-8234-123456789abc';
const query='?title=Synthetic&game=motion-quest&source=synthetic&duration=1&visibility=public&retention=7';
const headers={'Origin':origin,'Content-Type':'video/mp4','X-Sharing-Consent':'gallery-v1','X-Management-Key':'x'.repeat(32),'X-Upload-Bytes':'200000000'};
const request=(path,method='POST',extra={})=>new Request(origin+path,{method,headers:{...headers,...extra}});
const head=new Uint8Array([0,0,0,24,102,116,121,112,0,0,0,0]);
async function fixture(){
 const dir=await mkdtemp(tmpdir()+'/fitness-direct-'),objects=new Map();let now=Date.now(),preparations=0,mediaReadBytes=0,rewrites=0;
 const store=createAccountStore(dir,{now:()=>now});
 const user=async req=>req.headers.get('X-Player')?{userId:req.headers.get('X-Player').repeat(64)}:null;
 const env={GCP_BUCKET:'test',GCP_ACCESS_TOKEN_PROVIDER:async()=>'server-secret',ACCOUNTS:{...store,user,requireUser:async req=>{if(req.headers.get('X-CSRF-Token')!=='valid')throw Object.assign(Error('CSRF'),{status:403});return user(req);}}};
 const fetcher=async(raw,opt={})=>{
  const u=new URL(raw),h=new Headers(opt.headers);
  if(u.searchParams.has('upload_id')){assert.equal(opt.method,'DELETE');return new Response(null,{status:404});}
  assert.equal(h.get('Authorization'),'Bearer server-secret');
  if(u.searchParams.get('uploadType')==='resumable'){
   preparations++;const meta=JSON.parse(opt.body);assert.equal(h.get('Origin'),origin);assert.equal(h.get('X-Upload-Content-Length'),'200000000');
   objects.set(meta.name,{...meta,size:'200000000',generation:'1',head});
   return new Response(null,{status:200,headers:{Location:'https://storage.googleapis.com/upload/storage/v1/b/test/o?upload_id=synthetic-capability'}});
  }
  const suffix=u.pathname.split('/o/')[1]||'',name=decodeURIComponent(suffix.split('/rewriteTo/')[0]);
  if(u.pathname.includes('/rewriteTo/')){
   rewrites++;assert.equal(u.searchParams.get('ifSourceGenerationMatch'),'1');assert.equal(u.searchParams.get('ifGenerationMatch'),'0');
   const dest=decodeURIComponent(u.pathname.split('/o/').at(-1));
   if(objects.has(dest))return new Response(null,{status:412});
   const metadata=JSON.parse(opt.body);objects.set(dest,{...objects.get(name),...metadata,name:dest});
   return Response.json({done:true,resource:objects.get(dest)});
  }
  if(opt.method==='POST'){
   const decoded=await decodeUpload(raw,opt);const dest=u.searchParams.get('name');
   if(objects.has(dest))return new Response(null,{status:412});objects.set(dest,{bytes:decoded.body});return Response.json({name:dest});
  }
  if(!name)return Response.json({items:[...objects.keys()].filter(x=>x.startsWith('gallery/')).map(name=>({name}))});
  if(opt.method==='DELETE'){objects.delete(name);return new Response(null,{status:204});}
  const o=objects.get(name);if(!o)return new Response(null,{status:404});
  if(h.has('Range')){assert.equal(h.get('Range'),'bytes=0-11');mediaReadBytes+=12;return new Response(o.head,{status:206,headers:{'Content-Length':'12'}});}
  if(u.searchParams.has('alt'))return new Response(o.bytes);
  return Response.json(o);
 };
 const worker=createWorker({fetcher,now:()=>now});
 let adapter=await directUploadWorker(worker,{directory:dir+'/direct',fetcher,now:()=>now});
 return {dir,env,objects,get adapter(){return adapter;},stats:()=>({preparations,mediaReadBytes,rewrites}),advance:()=>now+=600001,
 restart:async()=>{adapter=await directUploadWorker(worker,{directory:dir+'/direct',fetcher,now:()=>now});},close:()=>rm(dir,{recursive:true,force:true})};
}
for(const signedIn of [false,true])test(`direct GCS upload: ${signedIn?'private permanent account':'anonymous finite'} publication survives restart without proxying video`,async()=>{
 const f=await fixture();
 const extra=signedIn?{'X-Player':'a','X-CSRF-Token':'valid','X-Sharing-Consent':'private-v1'}:{};
 const q=signedIn?query.replace('public','private').replace('retention=7','retention=never'):query;
 const path='/api/direct-uploads/'+id;
 try{
  const start=await f.adapter.fetch(request(path+q,'POST',extra),f.env);assert.equal(start.status,201);
  const descriptor=await start.json();assert.ok(descriptor.uploadURL.startsWith('https://storage.googleapis.com/'));assert.equal(descriptor.token,undefined);
  const stored=await readFile(f.dir+'/direct/pending.json','utf8');assert.ok(!stored.includes('capability')&&!stored.includes('server-secret'));
  await f.restart();
  const result=await f.adapter.fetch(request(path+'/complete','POST',extra),f.env);assert.equal(result.status,201,await result.clone().text());
  const clip=await result.json();assert.equal(clip.bytes,200000000);assert.equal(clip.expiresAt===null,signedIn);
  const media=f.objects.get('videos/'+id);assert.equal(media.customTime===null,signedIn);
  assert.deepEqual(f.stats(),{preparations:1,mediaReadBytes:12,rewrites:1});
  assert.equal([...f.objects.keys()].filter(x=>x.startsWith('videos/.pending/')).length,0);
  const retried=await f.adapter.fetch(request(path+q,'POST',extra),f.env);assert.equal(retried.status,200);assert.equal((await retried.json()).published.id,id);
 }finally{await f.close();}
});
test('direct capabilities enforce consent, identity, CSRF, size, ownership and cancellation',async()=>{
 const f=await fixture(),path='/api/direct-uploads/'+id;
 try{
  for(const [extra,status] of [[{Origin:'https://evil.invalid'},403],[{'X-Sharing-Consent':'bad'},400],[{'X-Upload-Bytes':'200000001'},413],[{'X-CSRF-Token':'expired'},401],[{'X-Player':'a','X-CSRF-Token':'wrong'},403]])assert.equal((await f.adapter.fetch(request(path+query,'POST',extra),f.env)).status,status);
  assert.equal(f.stats().preparations,0);
  assert.equal((await f.adapter.fetch(request(path+query),f.env)).status,201);
  assert.equal((await f.adapter.fetch(request(path+'/complete','POST',{'X-Management-Key':'y'.repeat(32)}),f.env)).status,404);
  const object=[...f.objects.values()][0];object.size='200000001';
  assert.equal((await f.adapter.fetch(request(path+'/complete'),f.env)).status,400);assert.equal(f.stats().rewrites,0);
  assert.equal((await f.adapter.fetch(request(path+query),f.env)).status,201);
  assert.equal((await f.adapter.fetch(request(path,'DELETE'),f.env)).status,200);assert.equal(f.objects.size,0);
  await f.adapter.fetch(request(path+query),f.env);f.advance();
  assert.equal((await f.adapter.fetch(request(path+'/complete'),f.env)).status,404);
 }finally{await f.close();}
});
test('browser transport sends the Blob only to GCS and never forwards app credentials',async()=>{
 const calls=[];const fetch=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('/complete'))return Response.json({id});
  if(url.startsWith('/api/direct-uploads/'))return Response.json({uploadURL:'https://storage.googleapis.com/upload/storage/v1/b/test/o?upload_id=synthetic'});
  assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.deepEqual(Object.keys(options.headers),['Content-Type']);
  return new Response(null,{status:200});
 };
 const context={window:{fetch},location:{href:origin+'/',origin},URL,Headers,Response,Blob,AbortSignal};
 vm.runInNewContext(await readFile(new URL('./upload-transport.js',import.meta.url),'utf8'),context);
 const blob=new Blob([head],{type:'video/mp4'});
 const result=await context.window.fetch('/api/clips/'+id+query,{method:'PUT',headers:{'X-CSRF-Token':'private','X-Sharing-Consent':'gallery-v1'},body:blob,credentials:'same-origin'});
 assert.equal(result.status,200);assert.equal(calls.length,3);assert.equal(calls[1].options.body,blob);
 assert.ok(!calls[0].options.body&&!calls[2].options.body);
});
