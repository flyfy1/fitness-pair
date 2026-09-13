import {test, expect} from '@playwright/test';
import http from 'node:http';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash, randomUUID} from 'node:crypto';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGateway} from '../deploy/gcp/gateway.mjs';
import {createAccountStore, ACCOUNT_LIMIT_BYTES, ANONYMOUS_LIMIT_BYTES} from '../deploy/gcp/account-store.mjs';
import {createWorker} from '../server/worker.js';

const origin='http://127.0.0.1:5193', issuer='http://127.0.0.1:5194';
const root=path.resolve(fileURLToPath(new URL('../../../dist/client/',import.meta.url)));
const objects=new Map(), codes=new Map();
let directory,gateway,identity,store,failMarker=false;
const userId=name=>createHash('sha256').update(issuer+'\n'+name).digest('hex');

test.beforeAll(async()=>{
 directory=await mkdtemp(tmpdir()+'/hopmodo-browser-'); store=createAccountStore(directory);
 identity=http.createServer(async(req,res)=>{
  const url=new URL(req.url,issuer);
  if(url.pathname==='/authorize'){
   const links=['alice','bob'].map(name=>{const code=randomUUID();codes.set(code,{name,challenge:url.searchParams.get('code_challenge'),callback:url.searchParams.get('redirect_uri')});const next=new URL(url.searchParams.get('redirect_uri'));next.search=new URLSearchParams({code,state:url.searchParams.get('state')});return `<a href="${next.href.replaceAll('&','&amp;')}">Continue as ${name}</a>`;});
   const cancel=new URL(url.searchParams.get('redirect_uri'));cancel.search=new URLSearchParams({error:'access_denied',state:url.searchParams.get('state')});
   res.setHeader('Content-Type','text/html');res.end(`<h1>Mock Integ.Life identity</h1>${links.join('<br>')}<br><a href="${cancel.href.replaceAll('&','&amp;')}">Cancel login</a>`);return;
  }
  if(url.pathname==='/token'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const values=new URLSearchParams(Buffer.concat(chunks).toString()),code=values.get('code'),item=codes.get(code);codes.delete(code);
   if(!item||values.get('redirect_uri')!==item.callback||createHash('sha256').update(values.get('code_verifier')).digest('base64url')!==item.challenge){res.writeHead(400);res.end('{}');return;}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({access_token:item.name}));return;
  }
  if(url.pathname==='/userinfo'){const name=req.headers.authorization?.replace('Bearer ','');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({sub:name,email:name+'@example.test'}));return;}
  res.writeHead(404);res.end();
 });identity.listen(5194,'127.0.0.1');await once(identity,'listening');
 const cloud=async(raw,options)=>{
  const url=new URL(raw),name=url.searchParams.get('name')||decodeURIComponent(url.pathname.split('/o/')[1]||'');
  if(options.method==='POST'){
   if(failMarker&&name.startsWith('gallery/')){failMarker=false;return new Response('',{status:503});}
   if(objects.has(name))return new Response('',{status:412});
   objects.set(name,typeof options.body==='string'?new TextEncoder().encode(options.body):options.body);return Response.json({name});
  }
  if(!name)return Response.json({items:[...objects.keys()].filter(name=>name.startsWith('gallery/')).map(name=>({name}))});
  if(!objects.has(name))return new Response('',{status:404});
  if(options.method==='DELETE'){objects.delete(name);return new Response(null,{status:204});}
  const bytes=objects.get(name);
  if(options.headers.Range){const match=/bytes=(\d+)-(\d*)/.exec(options.headers.Range),start=Number(match[1]),end=match[2]?Number(match[2]):bytes.length-1;return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${bytes.length}`}});}
  return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});
 };
 const worker=createWorker({fetcher:cloud});
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.wasm':'application/wasm'};
 gateway=createGateway({origin,env:{FITNESS_STATE_DIR:directory,INTEG_AUTH_ISSUER:issuer,INTEG_AUTH_CLIENT_ID:'hopmodo',INTEG_AUTH_CLIENT_SECRET:'browser-test-secret-is-at-least-32-chars',GCP_BUCKET:'mock',GCP_ACCESS_TOKEN_PROVIDER:async()=>'mock-token'},galleryWorker:{fetch(request,env){return worker.fetch(request,{...env,ASSETS:{async fetch(request){let name=new URL(request.url).pathname; if(name==='/')name='/index.html';const filename=path.resolve(root,'.'+name);if(!filename.startsWith(root+'/'))return new Response('',{status:404});try{return new Response(await readFile(filename),{headers:{'Content-Type':types[path.extname(filename)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}}}});}}});
 gateway.listen(5193,'127.0.0.1');await once(gateway,'listening');
});
test.afterAll(async()=>{for(const server of [gateway,identity]){server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));}await rm(directory,{recursive:true,force:true});});

async function login(page,name='alice'){
 await page.goto('/shared');await page.getByRole('link',{name:'Log in with Integ.Life'}).click();
 await page.getByRole('link',{name:'Continue as '+name}).click();
 await expect(page.getByText('Logged in as')).toContainText(name+'@example.test');
}
async function localClip(page){
 return page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');
  const stream=canvas.captureStream(15),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
  recorder.ondataavailable=event=>chunks.push(event.data);const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  for(let frame=0;frame<12;frame++){ctx.fillStyle=frame%2?'#2347ee':'#eeff41';ctx.fillRect(0,0,320,180);ctx.fillStyle='white';ctx.fillText('Synthetic account test',20,90);await new Promise(resolve=>setTimeout(resolve,70));}
  recorder.stop();await stopped;stream.getTracks().forEach(track=>track.stop());
  const blob=new Blob(chunks,{type:'video/webm'}),clip={id:crypto.randomUUID(),title:'Synthetic account clip',game:'motion-quest',source:'synthetic',duration:1,createdAt:Date.now(),blob};
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('fitness-pair-clips',1);request.onupgradeneeded=()=>request.result.createObjectStore('clips',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=reject;});
  await new Promise((resolve,reject)=>{const transaction=db.transaction('clips','readwrite');transaction.objectStore('clips').put(clip);transaction.oncomplete=resolve;transaction.onerror=reject;});db.close();return {id:clip.id,bytes:blob.size};
 });
}

test('login returns to the clip, publishes with consent, isolates accounts, and lets a second device revoke it',async({page,browser})=>{
 await page.goto('/library');const clip=await localClip(page);await page.reload();
 await page.getByRole('button',{name:'Upload & share'}).click();
 await expect(page.getByText('Upload without an account: public videos only. Anonymous uploads share a 10 GB pool across all visitors.')).toBeVisible();
 await page.getByRole('link',{name:'Log in with Integ.Life'}).click();await page.getByRole('link',{name:'Continue as alice'}).click();
 await expect(page.getByRole('heading',{name:'Upload and share this clip?'})).toBeVisible();
 await expect(page.locator('input[name="code"]')).toHaveCount(0);
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Upload this clip'}).click();
 await expect(page.getByText('Uploaded.',{exact:false})).toBeVisible();
 expect(objects.get('videos/'+clip.id).length).toBe(clip.bytes);expect(objects.get('videos/'+clip.id+'.jpg').length).toBeGreaterThan(100);
 await page.goto('/shared');await expect(page.locator('meter')).toHaveAttribute('value',String(clip.bytes));
 const stranger=await browser.newContext({baseURL:origin}),other=await stranger.newPage();
 await other.goto(origin+'/clips/'+clip.id);await expect(other.locator('video')).not.toHaveAttribute('src');await other.getByRole('button',{name:/Play replay:/}).click();await expect.poll(()=>other.locator('video').evaluate(video=>video.currentTime)).toBeGreaterThan(0);
 await expect(other.getByRole('button',{name:'Remove shared clip'})).toBeHidden();
 await login(other,'bob');await expect(other.getByRole('heading',{name:'NO SHARED CLIPS YET.'})).toBeVisible();
 const forbidden=await other.evaluate(async id=>{const session=await(await fetch('/api/auth/session')).json();return (await fetch('/api/clips/'+id,{method:'DELETE',headers:{'X-CSRF-Token':session.csrfToken}})).status;},clip.id);expect(forbidden).toBe(403);
 const secondDevice=await browser.newContext({baseURL:origin}),second=await secondDevice.newPage();await login(second,'alice');
 await expect(second.getByRole('heading',{name:'Synthetic account clip'})).toBeVisible();
 await second.getByRole('button',{name:'Remove',exact:true}).click();await second.getByRole('button',{name:'Remove shared clip',exact:true}).click();
 await expect(second.locator('meter')).toHaveAttribute('value','0');expect(objects.has('videos/'+clip.id)).toBe(false);
 expect((await page.request.get('/api/media/'+clip.id)).status()).toBe(404);expect(objects.has('videos/'+clip.id+'.jpg')).toBe(false);
 await page.goto('/library');await expect(page.locator('video')).toHaveCount(1);
 await second.getByRole('button',{name:'Log out',exact:true}).click();await expect(second.getByRole('link',{name:'Log in with Integ.Life'})).toBeVisible();
 await stranger.close();await secondDevice.close();
});

test('full quota blocks the UI and API; a partial upload remains manageable without losing its reservation',async({page})=>{
 await login(page);await page.goto('/library');const clip=await localClip(page),filler=randomUUID();
 await store.reserve(userId('alice'),{id:filler,title:'Synthetic quota reservation',game:'motion-quest',bytes:ACCOUNT_LIMIT_BYTES-clip.bytes+1,createdAt:Date.now(),expiresAt:Date.now()+60000});
 await page.reload();await page.getByRole('button',{name:'Upload & share'}).click();
 await expect(page.getByRole('button',{name:'Upload this clip'})).toBeDisabled();
 const result=await page.evaluate(async id=>{
  const session=await(await fetch('/api/auth/session')).json();
  const db=await new Promise(resolve=>{const req=indexedDB.open('fitness-pair-clips',1);req.onsuccess=()=>resolve(req.result);});
  const clip=await new Promise(resolve=>{const req=db.transaction('clips').objectStore('clips').get(id);req.onsuccess=()=>resolve(req.result);});db.close();
  const response=await fetch('/api/clips/'+id+'?title=Quota&game=motion-quest&source=synthetic&duration=1',{method:'PUT',headers:{'Content-Type':clip.blob.type,'X-Sharing-Consent':'gallery-v1','X-CSRF-Token':session.csrfToken},body:clip.blob});return response.status;
 },clip.id);expect(result).toBe(413);expect(objects.has('videos/'+clip.id)).toBe(false);
 await store.release(userId('alice'),filler);await page.reload();await page.getByRole('button',{name:'Upload & share'}).click();
 failMarker=true;await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Upload this clip'}).click();
 await expect(page.getByText('Publication did not finish.',{exact:false})).toBeVisible();
 await page.goto('/shared');await expect(page.locator('meter')).toHaveAttribute('value',String(clip.bytes));
 await expect(page.getByText('This upload did not finish or is being removed.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Remove',exact:true}).click();await page.getByRole('button',{name:'Remove shared clip',exact:true}).click();
 await expect(page.locator('meter')).toHaveAttribute('value','0');expect(objects.has('videos/'+clip.id)).toBe(false);
});

test('mobile login and cancellation stay reachable without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/shared');
 await page.getByRole('link',{name:'Log in with Integ.Life'}).click();await page.getByRole('link',{name:'Cancel login'}).click();
 await expect(page.getByText('Login cancelled.',{exact:false})).toBeVisible();
 await page.getByRole('link',{name:'Log in with Integ.Life'}).click();await page.getByRole('link',{name:'Continue as alice'}).click();
 await expect(page.locator('meter')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('anonymous player publishes public video, a friend watches, and the original browser removes it',async({page,browser})=>{
 await page.goto('/library');const clip=await localClip(page);await page.reload();
 await page.getByRole('button',{name:'Upload & share'}).click();
 await expect(page.getByText('Upload without an account:',{exact:false})).toBeVisible();
 await expect(page.getByRole('combobox')).toHaveCount(0);
 expect(objects.has('videos/'+clip.id)).toBe(false);
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Upload this clip'}).click();
 await expect(page.getByText('Public in the gallery.',{exact:false})).toBeVisible();
 expect((await store.list(null)).usedBytes).toBe(clip.bytes);
 expect(objects.get('videos/'+clip.id+'.jpg').length).toBeGreaterThan(100);
 const friend=await browser.newContext({baseURL:origin}),viewer=await friend.newPage();
 await viewer.goto('/gallery');await expect(viewer.locator('a[href="/clips/'+clip.id+'"]').first()).toBeVisible();
 await viewer.goto('/clips/'+clip.id);await viewer.getByRole('button',{name:/Play replay:/}).click();
 await expect.poll(()=>viewer.locator('video').evaluate(video=>video.currentTime)).toBeGreaterThan(0);
 await expect(viewer.getByRole('button',{name:'Remove shared clip'})).toBeHidden();
 await page.goto('/clips/'+clip.id);await page.getByRole('button',{name:'Remove shared clip'}).click();await page.getByRole('button',{name:'Remove shared clip',exact:true}).last().click();
 await expect(page.getByRole('heading',{name:'SHARED CLIP REMOVED.'})).toBeVisible();
 expect((await store.list(null)).usedBytes).toBe(0);expect((await viewer.request.get('/api/media/'+clip.id)).status()).toBe(404);
 await friend.close();
});

test('private video stays out of the gallery and plays for a friend only with the full copied link',async({page,browser})=>{
 await login(page);await page.goto('/library');const clip=await localClip(page);await page.reload();
 await page.getByRole('button',{name:'Upload & share'}).click();
 await page.getByRole('combobox').selectOption('private');
 await page.setViewportSize({width:390,height:844});await page.locator('.publish-form').scrollIntoViewIfNeeded();await page.screenshot({path:'.local/private-upload-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByText('Private: hidden from the public gallery.',{exact:false})).toBeVisible();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Upload this clip'}).click();
 await expect(page.getByText('Private link ready.',{exact:false})).toBeVisible();
 const shared=await page.getByRole('link',{name:'Open shared video'}).getAttribute('href');expect(shared).toContain('?share=');
 await page.goto('/shared');await expect(page.getByText('Private · Link access',{exact:false})).toBeVisible();
 expect(await page.getByRole('link',{name:'Open shared link'}).getAttribute('href')).toBe(shared);
 const friend=await browser.newContext({baseURL:origin}),viewer=await friend.newPage();
 await viewer.goto('/gallery');await expect(viewer.locator('a[href*="'+clip.id+'"]').first()).toHaveCount(0);
 await viewer.goto('/clips/'+clip.id);await expect(viewer.getByRole('heading',{name:'CLIP UNAVAILABLE.'})).toBeVisible();
 await viewer.goto(shared);await expect(viewer.locator('.clip-view h1')).toHaveText('Synthetic account clip');
 await viewer.getByRole('button',{name:/Play replay:/}).click();await expect.poll(()=>viewer.locator('video').evaluate(video=>video.currentTime)).toBeGreaterThan(0);
 expect(await viewer.locator('video').getAttribute('poster')).toContain('?share=');
 await viewer.evaluate(()=>{window.copied=null;Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copied=value;}}});});
 await viewer.getByRole('button',{name:'Copy link',exact:true}).click();expect(await viewer.evaluate(()=>window.copied)).toBe(origin+shared);
 await page.getByRole('button',{name:'Remove',exact:true}).click();await page.getByRole('button',{name:'Remove shared clip',exact:true}).click();
 await expect(page.locator('meter')).toHaveAttribute('value','0');
 await viewer.reload();await expect(viewer.getByRole('heading',{name:'CLIP UNAVAILABLE.'})).toBeVisible();await friend.close();
});

test('anonymous full pool explains login recovery and an interrupted upload can be removed from the form',async({page})=>{
 await page.setViewportSize({width:320,height:740});await page.goto('/library');const clip=await localClip(page),filler=randomUUID();
 await store.reserve(null,{id:filler,bytes:ANONYMOUS_LIMIT_BYTES,expiresAt:Date.now()+60000});
 await page.reload();await page.getByRole('button',{name:'Upload & share'}).click();
 await expect(page.getByRole('button',{name:'Upload this clip'})).toBeDisabled();
 await expect(page.locator('[data-status]')).toContainText('10 GB anonymous storage is full');
 await page.locator('.publish-form').scrollIntoViewIfNeeded();await page.screenshot({path:'.local/anonymous-full-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await store.release(null,filler);await page.reload();await page.getByRole('button',{name:'Upload & share'}).click();
 failMarker=true;await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Upload this clip'}).click();
 await expect(page.getByRole('button',{name:'Remove unfinished upload'})).toBeVisible();
 expect((await store.list(null)).usedBytes).toBe(clip.bytes);
 await page.getByRole('button',{name:'Remove unfinished upload'}).click();await page.getByRole('button',{name:'Remove shared clip',exact:true}).click();
 await expect.poll(async()=>(await store.list(null)).usedBytes).toBe(0);await expect(page.getByRole('button',{name:'Upload this clip'})).toBeEnabled();
});
