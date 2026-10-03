import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from './worker.js';
import {decodeUpload} from './testing/gcs-upload.mjs';
const id='550e8400-e29b-41d4-a716-446655440000',origin='https://arcade.test',key='a'.repeat(40);
async function fixture({anonymous=false,privateClip=false,expiresAt=null}={}){
 const video=new Uint8Array([26,69,223,163,0,0,0,0,0,0,0,0,0]);
 const keyHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))).toString('hex');
 const entry={id,title:'Synthetic test',source:'synthetic',game:'motion-quest',duration:1,mime:'video/webm',createdAt:1000,expiresAt,bytes:video.length,ownerId:anonymous?null:'owner',visibility:privateClip?'private':'public',...(anonymous?{keyHash}:{}),...(privateClip?{shareToken:'private-test-link'}:{})};
 const objects=new Map([[`gallery/${id}.json`,JSON.stringify(entry)],[`videos/${id}`,video],[`videos/${id}.jpg`,new Uint8Array([255,216,255,217])]]);
 let generation=1,writes=0,conflict=false,failWrite=false,removeDuringWrite=false;
 const user=async request=>request.headers.get('Authorization')==='Bearer owner'?{userId:'owner'}:request.headers.get('Authorization')==='Bearer stranger'?{userId:'stranger'}:null;
 const env={GCP_BUCKET:'test-only',GCP_ACCESS_TOKEN_PROVIDER:async()=>'test-only',ACCOUNTS:{user,async requireUser(request,write){const value=await user(request);if(!value)throw Object.assign(Error('Log in'),{status:401});if(write&&request.headers.get('X-CSRF-Token')!=='test-csrf')throw Object.assign(Error('Invalid CSRF'),{status:403});return value;},async list(userId){const clips=objects.has(`gallery/${id}.json`)&&userId===entry.ownerId?[entry]:[];return {clips,usedBytes:clips.reduce((sum,clip)=>sum+clip.bytes,0),limitBytes:2000000000};},async release(){}}};
 const worker=createWorker({now:()=>2000,fetcher:async(raw,options)=>{
  const url=new URL(raw),name=url.searchParams.get('name')||decodeURIComponent(url.pathname.split('/o/')[1]||'');
  if(options.method==='POST'){
   if(removeDuringWrite){objects.delete(name);return new Response('',{status:412});}
   if(failWrite)return new Response('',{status:503});
   if(conflict||url.searchParams.get('ifGenerationMatch')!==String(generation))return new Response('',{status:412});
   const decoded=await decodeUpload(raw,options);objects.set(name,decoded.body);generation++;writes++;
   if(expiresAt!==null)assert.equal(decoded.metadata.customTime,new Date(expiresAt).toISOString());
   return Response.json({name,generation:String(generation)});
  }
  if(!name)return Response.json({items:[...objects.keys()].filter(name=>name.startsWith('gallery/')).map(name=>({name}))});
  if(!objects.has(name))return new Response('',{status:404});
  if(options.method==='DELETE'){objects.delete(name);return new Response(null,{status:204});}
  if(url.searchParams.get('fields')==='generation')return Response.json({generation:String(generation)});
  if(url.searchParams.has('generation')&&url.searchParams.get('generation')!==String(generation))return new Response('',{status:404});
  return new Response(objects.get(name));
 }});
 const request=(path,options={})=>worker.fetch(new Request(origin+path,options),env);
 const ownerHeaders={Authorization:'Bearer owner','X-CSRF-Token':'test-csrf',Origin:origin};
 const manageHeaders=anonymous?{Origin:origin,'X-Management-Key':key}:ownerHeaders;
 const change=(state,extra={},body=JSON.stringify({publicationState:state}))=>request('/api/clips/'+id,{method:'PATCH',headers:{...manageHeaders,'Content-Type':'application/json',...(state==='published'?{'X-Sharing-Consent':'gallery-v1'}:{}),...extra},body});
 return {request,change,entry,video,objects,ownerHeaders,manageHeaders,writes:()=>writes,setConflict:()=>{conflict=true;},setFailure:()=>{failWrite=true;},removeDuringWrite:()=>{removeDuringWrite=true;}};
}
for(const expiresAt of [null,900000])test(`owner pauses and restores all public entry points without changing bytes, quota or expiry (${expiresAt})`,async()=>{
 const f=await fixture({expiresAt});
 assert.equal((await (await f.request('/api/clips')).json()).clips[0].publicationState,'published');
 const pause=await f.change('paused');assert.equal(pause.status,200);assert.equal((await pause.json()).publicationState,'paused');
 for(const kind of ['clips','media','posters'])for(const method of ['GET','HEAD']){
  const response=await f.request(`/api/${kind}/${id}`,{method,headers:{Range:'bytes=0-3'}});assert.equal(response.status,404);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal((await f.request(`/api/${kind}/${id}`,{headers:f.ownerHeaders})).status,200);
 }
 assert.equal((await (await f.request('/api/clips')).json()).clips.length,0);
 const account=await (await f.request('/api/account/clips',{headers:f.ownerHeaders})).json();
 assert.equal(account.clips[0].publicationState,'paused');assert.equal(account.usedBytes,f.video.length);
 assert.deepEqual(f.objects.get('videos/'+id),f.video);
 assert.equal((await f.change('paused')).status,200);assert.equal(f.writes(),1);
 assert.equal((await f.change('published',{'X-Sharing-Consent':''})).status,400);
 const resumed=await f.change('published');assert.equal(resumed.status,200);assert.equal((await resumed.json()).url,'/clips/'+id);
 assert.equal((await f.request('/api/media/'+id)).status,200);
 assert.equal((await (await f.request('/api/clips')).json()).clips.length,1);
 const stored=JSON.parse(f.objects.get('gallery/'+id+'.json'));
 assert.equal(stored.createdAt,f.entry.createdAt);assert.equal(stored.expiresAt,expiresAt);assert.equal(stored.bytes,f.entry.bytes);
});
test('anonymous device keys can pause, inspect and restore, while visitors and other devices cannot',async()=>{
 const f=await fixture({anonymous:true});
 assert.equal((await f.change('paused',{'X-Management-Key':'wrong'})).status,403);
 assert.equal((await f.change('paused',{Origin:'https://other.test'})).status,403);
 assert.equal((await f.change('paused',{Origin:''})).status,403);
 assert.equal((await f.change('paused')).status,200);
 assert.equal((await f.request('/api/clips/'+id)).status,404);
 const owned=await (await f.request('/api/clips/'+id,{headers:f.manageHeaders})).json();
 assert.equal(owned.canDelete,true);assert.equal(owned.publicationState,'paused');assert.equal(owned.keyHash,undefined);
 assert.equal((await f.change('published')).status,200);
});
test('ownership, CSRF, payload validation and consent prevent unauthorized changes',async()=>{
 const f=await fixture();
 assert.equal((await f.change('paused',{Authorization:'Bearer stranger'})).status,403);
 assert.equal((await f.change('paused',{'X-CSRF-Token':''})).status,403);
 assert.equal((await f.change('paused',{'Content-Type':'text/plain'})).status,415);
 assert.equal((await f.change('paused',{},JSON.stringify({publicationState:'paused',visibility:'private'}))).status,400);
 assert.equal((await f.change('unknown')).status,400);assert.equal(f.writes(),0);
 const privateFixture=await fixture({privateClip:true});assert.equal((await privateFixture.change('paused')).status,409);
});
test('conditional writes cannot resurrect removed/changed records, and failures leave the existing state intact',async()=>{
 for(const failure of ['conflict','failure']){
  const f=await fixture();failure==='conflict'?f.setConflict():f.setFailure();
  assert.equal((await f.change('paused')).status,failure==='conflict'?409:503);
  assert.equal((await f.request('/api/media/'+id)).status,200);assert.equal(f.writes(),0);
 }
});
test('deleting a paused publication still removes its media and poster',async()=>{
 const f=await fixture();await f.change('paused');
 assert.equal((await f.request('/api/clips/'+id,{method:'DELETE',headers:f.ownerHeaders})).status,200);
 assert.equal(f.objects.size,0);assert.equal((await f.change('published')).status,404);
});
test('a metadata removal during a state write is never overwritten or made public again',async()=>{
 const f=await fixture();f.removeDuringWrite();
 assert.equal((await f.change('paused')).status,409);
 assert.equal(f.objects.has('gallery/'+id+'.json'),false);assert.equal(f.writes(),0);
 assert.equal((await f.request('/api/media/'+id)).status,404);
});
