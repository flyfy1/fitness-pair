import {decodeUpload} from './testing/gcs-upload.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID, createHash} from 'node:crypto';
import {createWorker} from './worker.js';
import {createAccountStore, ANONYMOUS_LIMIT_BYTES} from '../deploy/gcp/account-store.mjs';

const owner='a'.repeat(64), other='b'.repeat(64), key='anonymous-test-key-'.repeat(3);
const video=new Uint8Array([26,69,223,163,0,0,0,0,0,0,0,0,0]);
const hash=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t,{now=Date.now}={}){
 const directory=await mkdtemp(tmpdir()+'/hopmodo-sharing-');t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=createAccountStore(directory,{now}),objects=new Map(),metadata=new Map();let failMarker=false,failDelete=false,failUpload=false;
 const env={GCP_BUCKET:'test',GCP_ACCESS_TOKEN_PROVIDER:async()=>'mock',ACCOUNTS:{...store,
  async user(request){const id=request.headers.get('X-Test-User');return id?{userId:id}:null;},
  async requireUser(request,write){const user=await this.user(request);if(!user)throw Object.assign(Error('Log in'),{status:401});if(write&&request.headers.get('X-CSRF-Token')!=='csrf')throw Object.assign(Error('CSRF'),{status:403});return user;}
 }};
 const events=[];
 const worker=createWorker({now,audit:event=>events.push(event),fetcher:async(raw,options)=>{
  const url=new URL(raw),name=url.searchParams.get('name')||decodeURIComponent(url.pathname.split('/o/')[1]||'');
  if(options.method==='POST'){const decoded=await decodeUpload(raw,options);options={...options,body:decoded.body};metadata.set(name,decoded.metadata);
   if(failUpload&&name.startsWith('videos/')){failUpload=false;return new Response('',{status:503});}
   if(failMarker&&name.startsWith('gallery/')){failMarker=false;return new Response('',{status:503});}
   if(objects.has(name))return new Response('',{status:412});objects.set(name,options.body);return Response.json({name});
  }
  if(!name)return Response.json({items:[...objects.keys()].filter(name=>name.startsWith('gallery/')).map(name=>({name}))});
  if(!objects.has(name))return new Response('',{status:404});
  if(options.method==='DELETE'){if(failDelete&&name.startsWith('videos/')){failDelete=false;return new Response('',{status:503});}objects.delete(name);return new Response(null,{status:204});}
  if(options.headers.Range)return new Response(objects.get(name).slice(0,4),{status:206,headers:{'Content-Range':'bytes 0-3/13'}});
  return new Response(objects.get(name));
 }});
 const request=(path,options={})=>worker.fetch(new Request('https://arcade.test'+path,options),env);
 const headers=user=>({'Content-Type':'video/webm','Origin':'https://arcade.test','X-Sharing-Consent':'gallery-v1','X-Management-Key':key,...(user?{'X-Test-User':user,'X-CSRF-Token':'csrf'}:{})});
 const upload=(id,user=null,visibility='public',retention='7')=>request('/api/clips/'+id+'?title=Test&game=motion-quest&source=synthetic&duration=1&visibility='+visibility+'&retention='+retention,{method:'PUT',headers:{...headers(user),'X-Sharing-Consent':visibility==='private'?'private-v1':'gallery-v1'},body:video});
 return {store,objects,metadata,events,request,headers,upload,restart:()=>createAccountStore(directory,{now}),failUpload:()=>{failUpload=true;},failMarker:()=>{failMarker=true;},failDelete:()=>{failDelete=true;}};
}

test('anonymous uploads are public, counted with legacy clips, idempotent and removable only with the device key',async t=>{
 const f=await fixture(t),legacy=randomUUID(),id=randomUUID();
 f.objects.set('gallery/'+legacy+'.json',JSON.stringify({id:legacy,bytes:100,expiresAt:Date.now()+60000,keyHash:hash(key)}));
 assert.equal((await(await f.request('/api/config')).json()).anonymous.usedBytes,100);
 assert.equal((await f.upload(randomUUID(),null,'private')).status,403);
 assert.equal((await f.upload(id)).status,201);assert.equal((await f.upload(id)).status,200);
 assert.equal((await f.store.list(null)).usedBytes,100+video.length);
 assert.equal((await f.request('/api/media/'+id)).status,200);
 assert.equal((await(await f.request('/api/clips')).json()).clips.length,2);
 assert.equal((await f.request('/api/clips/'+id,{method:'DELETE',headers:{Origin:'https://arcade.test'}})).status,403);
 assert.equal((await f.request('/api/clips/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+key,Origin:'https://arcade.test'}})).status,200);
 assert.equal((await f.store.list(null)).usedBytes,100);
});

test('anonymous quota replaces old bytes, rejects stale sessions, and retains ambiguous writes until cleanup',async t=>{
 const f=await fixture(t),filler=randomUUID(),id=randomUUID();
 await f.store.reserve(null,{id:filler,bytes:ANONYMOUS_LIMIT_BYTES-video.length+1,expiresAt:Date.now()+60000});
 assert.equal((await f.upload(id)).status,201);assert.equal(f.objects.has('videos/'+id),true);
 assert.equal((await f.store.list(null)).clips.some(clip=>clip.id===filler),false);
 await f.request('/api/clips/'+id,{method:'DELETE',headers:f.headers(null)});
 assert.equal((await f.upload(randomUUID(),owner)).status,201);
 await f.store.release(null,filler);
 const stale=await f.request('/api/clips/'+id+'?title=Test&game=motion-quest&source=synthetic&duration=1',{method:'PUT',headers:{...f.headers(null),'X-CSRF-Token':'expired'},body:video});assert.equal(stale.status,401);
 f.failMarker();assert.equal((await f.upload(id)).status,503);assert.equal((await f.store.list(null)).usedBytes,video.length);
 assert.equal((await f.request('/api/clips/'+id,{method:'DELETE',headers:f.headers(null)})).status,200);
 assert.equal((await f.store.list(null)).usedBytes,0);
 const second=randomUUID();await f.upload(second);f.failDelete();
 assert.equal((await f.request('/api/clips/'+second,{method:'DELETE',headers:f.headers(null)})).status,503);
 assert.equal((await f.store.list(null)).usedBytes,video.length);
 assert.equal((await f.request('/api/clips/'+second,{method:'DELETE',headers:f.headers(null)})).status,200);
 assert.equal((await f.store.list(null)).usedBytes,0);
});

test('private metadata, video, thumbnails and ranges require the owner or share token; gallery never reveals them',async t=>{
 const f=await fixture(t),id=randomUUID();
 assert.equal((await f.request('/api/clips/'+id+'?title=Test&game=motion-quest&source=synthetic&duration=1&visibility=private',{method:'PUT',headers:f.headers(owner),body:video})).status,400);
 const response=await f.upload(id,owner,'private');assert.equal(response.status,201);
 const clip=await response.json(),query=new URL(clip.url,'https://arcade.test').search;
 assert.match(query,/^\?share=[A-Za-z0-9_-]{43}$/);assert.equal(clip.ownerId,undefined);
 assert.equal((await(await f.request('/api/clips')).json()).clips.length,0);
 const jpeg=new Uint8Array([255,216,0,0,0,0,0,0,0,0,255,217]);
 assert.equal((await f.request('/api/posters/'+id,{method:'PUT',headers:{...f.headers(owner),'Content-Type':'image/jpeg'},body:jpeg})).status,201);
 for(const kind of ['clips','media','posters'])for(const method of ['GET','HEAD']){
  assert.equal((await f.request('/api/'+kind+'/'+id,{method})).status,404);
  assert.equal((await f.request('/api/'+kind+'/'+id+'?share=wrong',{method,headers:{'X-Test-User':other}})).status,404);
  assert.equal((await f.request('/api/'+kind+'/'+id+query,{method})).status,200);
  assert.equal((await f.request('/api/'+kind+'/'+id,{method,headers:{'X-Test-User':owner}})).status,200);
 }
 assert.equal((await f.request('/api/media/'+id+query,{headers:{Range:'bytes=0-3'}})).status,206);
 const owned=await(await f.request('/api/account/clips',{headers:{'X-Test-User':owner}})).json();assert.equal(owned.clips[0].url,clip.url);
 assert.equal((await f.request('/api/clips/'+id+query,{method:'DELETE',headers:f.headers(other)})).status,403);
 assert.equal((await f.request('/api/clips/'+id,{method:'DELETE',headers:f.headers(owner)})).status,200);
 assert.equal((await f.request('/api/media/'+id+query)).status,404);
});


test('permanent account clips persist beyond 90 days while finite clips expire and storage metadata matches',async t=>{
 let clock=Date.now();const f=await fixture(t,{now:()=>clock});
 const permanent=randomUUID(),finite=randomUUID();
 assert.equal((await f.upload(permanent,owner,'private','never')).status,201);
 assert.equal((await f.upload(finite,owner,'public','1')).status,201);
 const entry=JSON.parse(f.objects.get('gallery/'+permanent+'.json'));
 assert.equal(entry.expiresAt,null);assert.equal(f.metadata.get('videos/'+permanent).customTime,undefined);assert.equal(f.metadata.get('gallery/'+permanent+'.json').customTime,undefined);
 const expiring=JSON.parse(f.objects.get('gallery/'+finite+'.json'));
 assert.equal(Date.parse(f.metadata.get('videos/'+finite).customTime),expiring.expiresAt);
 assert.equal(Date.parse(f.metadata.get('gallery/'+finite+'.json').customTime),expiring.expiresAt);
 clock+=91*86400000;
 assert.equal((await f.request('/api/media/'+finite)).status,404);
 assert.equal((await f.request('/api/media/'+permanent+'?share='+entry.shareToken)).status,200);
 assert.equal((await f.restart().list(owner)).usedBytes,video.length);
 assert.equal((await f.upload(randomUUID(),null,'public','never')).status,403);
 assert.equal((await f.upload(randomUUID(),owner,'public','-1')).status,400);
});

test('replacement stages new media before deleting oldest anonymous clips and never removes account videos',async t=>{
 const f=await fixture(t),old=randomUUID(),newer=randomUUID(),incoming=randomUUID(),owned=randomUUID(),expiry=Date.now()+86400000;
 await f.store.reserve(null,{id:old,bytes:8,createdAt:1,expiresAt:expiry});
 await f.store.reserve(null,{id:newer,bytes:ANONYMOUS_LIMIT_BYTES-8,createdAt:2,expiresAt:expiry});
 await f.store.reserve(owner,{id:owned,bytes:20,createdAt:0,expiresAt:null});
 for(const [id,ownerId,bytes,createdAt] of [[old,null,8,1],[newer,null,ANONYMOUS_LIMIT_BYTES-8,2],[owned,owner,20,0]]){
  f.objects.set('gallery/'+id+'.json',JSON.stringify({id,ownerId,bytes,createdAt,expiresAt:ownerId?null:expiry}));f.objects.set('videos/'+id,video);f.objects.set('videos/'+id+'.jpg',video);
 }
 f.failUpload();assert.equal((await f.upload(incoming)).status,503);
 assert.equal(f.objects.has('gallery/'+old+'.json'),true);assert.equal(f.objects.has('gallery/'+newer+'.json'),true);
 assert.equal((await f.upload(incoming)).status,201);
 for(const id of [old,newer])for(const name of ['gallery/'+id+'.json','videos/'+id,'videos/'+id+'.jpg'])assert.equal(f.objects.has(name),false);
 assert.equal(f.objects.has('gallery/'+owned+'.json'),true);assert.equal((await f.store.list(owner)).usedBytes,20);
 assert.equal((await f.store.list(null)).usedBytes,video.length);
});

test('failed eviction keeps its storage reserved, does not publish the replacement, and succeeds on retry',async t=>{
 const f=await fixture(t),old=randomUUID(),incoming=randomUUID(),expiry=Date.now()+86400000;
 await f.store.reserve(null,{id:old,bytes:ANONYMOUS_LIMIT_BYTES,createdAt:1,expiresAt:expiry});
 f.objects.set('gallery/'+old+'.json',JSON.stringify({id:old,bytes:ANONYMOUS_LIMIT_BYTES,ownerId:null,expiresAt:expiry}));f.objects.set('videos/'+old,video);
 f.failDelete();assert.equal((await f.upload(incoming)).status,503);
 assert.equal((await f.store.list(null)).usedBytes,ANONYMOUS_LIMIT_BYTES);assert.equal(f.objects.has('gallery/'+incoming+'.json'),false);assert.equal(f.objects.has('videos/'+incoming),false);
 assert.equal((await f.upload(incoming)).status,201);assert.equal((await f.store.list(null)).usedBytes,video.length);
});


test('larger than 200 MB declared, streamed and client-reported attempts are logged without media',async t=>{
 const f=await fixture(t),id=randomUUID(),limit=200_000_000;
 const path='/api/clips/'+id+'?title=Test&game=motion-quest&source=synthetic&duration=1';
 const declared=await f.request(path,{method:'PUT',headers:{...f.headers(owner),'Content-Length':String(limit+1)},body:video});
 assert.equal(declared.status,413);assert.match((await declared.json()).error,/200 MB/);
 assert.equal(f.events.at(-1).source,'server-header');assert.equal(f.events.at(-1).bytes,limit+1);
 let remaining=limit+1;const chunk=new Uint8Array(4_000_000);
 const body=new ReadableStream({pull(controller){const length=Math.min(remaining,chunk.length);remaining-=length;controller.enqueue(chunk.subarray(0,length));if(!remaining)controller.close();}});
 const streamed=await f.request(path,{method:'PUT',headers:{...f.headers(owner),'Content-Length':'13'},body,duplex:'half'});
 assert.equal(streamed.status,413);assert.equal(f.events.at(-1).source,'server-body');assert.equal(f.events.at(-1).bytes,limit+1);
 const report=options=>f.request('/api/upload-rejections',{method:'POST',headers:{Origin:'https://arcade.test','Content-Type':'application/json',...options},body:JSON.stringify({reason:'file_too_large',bytes:limit+1,title:'Do not log this private title'})});
 assert.equal((await report()).status,200);assert.equal(f.events.at(-1).source,'client-reported');
 assert.equal((await report({Origin:'https://untrusted.test'})).status,403);
 assert.equal(f.events.length,3);assert.equal(JSON.stringify(f.events).includes('private title'),false);
 assert.equal(f.events.every(event=>event.event==='video_upload_rejected'&&event.limitBytes===limit),true);
 assert.equal((await f.store.list(owner)).usedBytes,0);assert.equal(f.objects.has('videos/'+id),false);
});
