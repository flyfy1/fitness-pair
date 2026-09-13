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
async function fixture(t){
 const directory=await mkdtemp(tmpdir()+'/hopmodo-sharing-');t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=createAccountStore(directory),objects=new Map();let failMarker=false,failDelete=false;
 const env={GCP_BUCKET:'test',GCP_ACCESS_TOKEN_PROVIDER:async()=>'mock',ACCOUNTS:{...store,
  async user(request){const id=request.headers.get('X-Test-User');return id?{userId:id}:null;},
  async requireUser(request,write){const user=await this.user(request);if(!user)throw Object.assign(Error('Log in'),{status:401});if(write&&request.headers.get('X-CSRF-Token')!=='csrf')throw Object.assign(Error('CSRF'),{status:403});return user;}
 }};
 const worker=createWorker({fetcher:async(raw,options)=>{
  const url=new URL(raw),name=url.searchParams.get('name')||decodeURIComponent(url.pathname.split('/o/')[1]||'');
  if(options.method==='POST'){
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
 const upload=(id,user=null,visibility='public')=>request('/api/clips/'+id+'?title=Test&game=motion-quest&source=synthetic&duration=1&visibility='+visibility,{method:'PUT',headers:headers(user),body:video});
 return {store,objects,request,headers,upload,failMarker:()=>{failMarker=true;},failDelete:()=>{failDelete=true;}};
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

test('anonymous quota rejects actual incoming bytes, rejects stale sessions, and retains ambiguous writes until cleanup',async t=>{
 const f=await fixture(t),filler=randomUUID(),id=randomUUID();
 await f.store.reserve(null,{id:filler,bytes:ANONYMOUS_LIMIT_BYTES-video.length+1,expiresAt:Date.now()+60000});
 assert.equal((await f.upload(id)).status,413);assert.equal(f.objects.has('videos/'+id),false);
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
