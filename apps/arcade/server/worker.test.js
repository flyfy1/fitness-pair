import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker,validateUpload} from './worker.js';
const url=new URL('https://arcade.test/api/clips/550e8400-e29b-41d4-a716-446655440000?title=My%20move&game=dino-run&source=synthetic&duration=2');
const headers={'Content-Type':'video/webm','X-Sharing-Consent':'gallery-v1','X-Management-Key':'a'.repeat(40)};
test('unconfigured gallery has no fake clips and never calls storage',async()=>{const worker=createWorker({fetcher:()=>{throw Error('Unexpected network');}});const res=await worker.fetch(new Request('https://arcade.test/api/clips'),{});assert.deepEqual(await res.json(),{enabled:false,clips:[]});const put=await worker.fetch(new Request(url,{method:'PUT',headers,body:'clip'}),{});assert.equal(put.status,503);});
test('consent, type, duration, game, key and size are checked before reading video',()=>{assert.equal(validateUpload(new Request(url,{headers}),url).source,'synthetic');for(const changes of [{'X-Sharing-Consent':''},{'Content-Type':'text/html'},{'Content-Length':String(21*1024*1024)},{'X-Management-Key':'short'}])assert.throws(()=>validateUpload(new Request(url,{headers:{...headers,...changes}}),url));for(const [key,value] of [['duration','61'],['game','unknown'],['source','camera'],['title','']]){const changed=new URL(url);changed.searchParams.set(key,value);assert.throws(()=>validateUpload(new Request(changed,{headers}),changed));}});
test('upload authorization and same-origin checks precede GCP access',async()=>{const worker=createWorker({fetcher:()=>{throw Error('Unexpected network');}}),env={GCP_BUCKET:'private',GCP_SERVICE_ACCOUNT_JSON:'{}',SHARE_UPLOAD_CODE:'private-test-code'};assert.equal((await worker.fetch(new Request(url,{method:'PUT',headers,body:'x'}),env)).status,401);assert.equal((await worker.fetch(new Request(url,{method:'PUT',headers:{...headers,Origin:'https://elsewhere.test'},body:'x'}),env)).status,403);});
test('application routes preserve static game paths',async()=>{const seen=[];const env={ASSETS:{fetch:r=>{seen.push(new URL(r.url).pathname);return new Response('app');}}},worker=createWorker();for(const route of ['/play/dino-run','/library','/gallery','/clips/example','/games/dino-run/'])await worker.fetch(new Request('https://arcade.test'+route),env);assert.deepEqual(seen,['/','/','/','/','/games/dino-run/']);});
for(const identity of ['private-key','metadata'])test(`mock GCP ${identity} publication persists, retries idempotently, streams ranges, and revokes without exposing its key`,async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const der=await crypto.subtle.exportKey('pkcs8',pair.privateKey),pem='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(der).toString('base64')+'\n-----END PRIVATE KEY-----';
 const env={GCP_BUCKET:'test-only',GCP_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'test@example.test',private_key:pem}),SHARE_UPLOAD_CODE:'private-test-code'},objects=new Map();let writes=0;
 if(identity==='metadata'){delete env.GCP_SERVICE_ACCOUNT_JSON;env.GCP_ACCESS_TOKEN_PROVIDER=async()=>'test-token';}
 const fetcher=async(raw,options)=>{
  const u=new URL(raw);if(u.hostname==='oauth2.googleapis.com'){assert.equal(identity,'private-key');return Response.json({access_token:'test-token',expires_in:3600});}
  assert.equal(options.headers.Authorization,'Bearer test-token');
  const name=u.searchParams.get('name')||decodeURIComponent(u.pathname.split('/o/')[1]||'');
  if(options.method==='POST'){if(objects.has(name))return new Response('',{status:412});objects.set(name,typeof options.body==='string'?new TextEncoder().encode(options.body):options.body);writes++;return Response.json({name});}
  if(!name)return Response.json({items:[...objects.keys()].filter(x=>x.startsWith('gallery/')).map(name=>({name}))});
  if(!objects.has(name))return new Response('',{status:404});
  if(options.method==='DELETE'){objects.delete(name);return new Response(null,{status:204});}
  const bytes=objects.get(name);if(options.headers.Range){assert.equal(options.headers.Range,'bytes=0-3');return new Response(bytes.slice(0,4),{status:206,headers:{'Content-Length':'4','Content-Range':`bytes 0-3/${bytes.length}`}});}
  return new Response(bytes);
 };
 const worker=createWorker({fetcher});const authHeaders={...headers,Authorization:'Bearer '+env.SHARE_UPLOAD_CODE};const video=new Uint8Array([26,69,223,163,0,0,0,0,0,0,0,0,0]);
 const publish=()=>worker.fetch(new Request(url,{method:'PUT',headers:authHeaders,body:video}),env);
 const first=await publish();assert.equal(first.status,201);const clip=await first.json();assert.equal(clip.url,'/clips/550e8400-e29b-41d4-a716-446655440000');assert.equal(clip.keyHash,undefined);assert.equal(clip.key,undefined);
 assert.equal((await publish()).status,200);assert.equal(writes,2);
 const gallery=await worker.fetch(new Request('https://arcade.test/api/clips'),env);assert.equal((await gallery.json()).clips.length,1);
 const media=await worker.fetch(new Request('https://arcade.test/api/media/'+clip.id,{headers:{Range:'bytes=0-3'}}),env);assert.equal(media.status,206);assert.equal((await media.arrayBuffer()).byteLength,4);
 const wrong=await worker.fetch(new Request(url,{method:'DELETE',headers:{Authorization:'Bearer wrong'}}),env);assert.equal(wrong.status,403);
 const removed=await worker.fetch(new Request(url,{method:'DELETE',headers:{Authorization:'Bearer '+headers['X-Management-Key']}}),env);assert.equal(removed.status,200);assert.equal(objects.size,0);
 assert.equal((await worker.fetch(new Request('https://arcade.test/api/media/'+clip.id),env)).status,404);
});

test('all mounted games use shared same-origin tracking assets and support clip metadata',async()=>{
 const seen=[],worker=createWorker(),env={ASSETS:{fetch:r=>{seen.push(new URL(r.url).pathname);return new Response('asset');}}};
 for(const game of ['motion-quest','dino-run','dino-ar','plank-flight','camera-start']){
  await worker.fetch(new Request(`https://arcade.test/games/${game}/runtime/pose-worker.js`),env);
  const target=new URL(url);target.searchParams.set('game',game);assert.equal(validateUpload(new Request(target,{headers}),target).game,game);
 }
 assert.deepEqual(seen,Array(5).fill('/runtime/pose-worker.js'));
});
