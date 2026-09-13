import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createApp } from './server.mjs';
const code='test-only-upload-code';
async function setup(t, extra={}) {
  const dir=await mkdtemp(path.join(tmpdir(),'fitness-sharing-'));
  const dataDir=path.join(dir,'data');
  let app=await createApp({dataDir,uploadCode:code,...extra});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base=()=>`http://127.0.0.1:${app.address().port}`;
  t.after(async()=>{await new Promise(resolve=>app.close(resolve));await rm(dir,{recursive:true,force:true});});
  return {dir,dataDir,base, async restart(){await new Promise(resolve=>app.close(resolve));app=await createApp({dataDir,uploadCode:code,...extra});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));}};
}
function video(format='mp4', duration=1) {
  const args=['-v','error','-f','lavfi','-i','color=c=green:s=320x180:r=24','-t',String(duration),'-an'];
  if(format==='mp4')args.push('-c:v','libx264','-pix_fmt','yuv420p','-movflags','frag_keyframe+empty_moov','-f','mp4');
  else args.push('-c:v','libvpx','-deadline','realtime','-f','webm');
  return execFileSync('ffmpeg',[...args,'pipe:1'],{maxBuffer:5*1024*1024});
}
function upload(base,body,overrides={}) {return fetch(base+'/api/clips?title=%3Cscript%3E%26%22&source=synthetic',{method:'POST',headers:{'Content-Type':'video/mp4',Authorization:`Bearer ${code}`,'X-Sharing-Consent':'public-v1',...overrides},body});}
test('publish, persistence, safe metadata, poster, ranges and authorized revocation',async t=>{
  const s=await setup(t), body=video();
  const response=await upload(s.base(),body);assert.equal(response.status,201,await response.clone().text());
  const clip=await response.json();assert.match(clip.id,/^[a-f0-9]{32}$/);assert.equal(clip.manageToken.length,64);
  await s.restart();
  const metadata=await (await fetch(s.base()+'/api/clips/'+clip.id)).json();assert.equal(metadata.title,'<script>&"');assert.equal(metadata.manageToken,undefined);assert.equal(metadata.tokenHash,undefined);
  const page=await fetch(s.base()+'/s/'+clip.id);const html=await page.text();assert.ok(html.includes('&lt;script&gt;&amp;&quot;'));assert.ok(html.includes('og:video'));assert.equal(page.headers.get('Cache-Control'),'no-store');
  const poster=await fetch(s.base()+'/poster/'+clip.id);assert.equal(poster.headers.get('content-type'),'image/jpeg');assert.ok((await poster.arrayBuffer()).byteLength>100);
  const range=await fetch(s.base()+'/media/'+clip.id,{headers:{Range:'bytes=10-29'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),body.subarray(10,30));
  const suffix=await fetch(s.base()+'/media/'+clip.id,{headers:{Range:'bytes=-10'}});assert.equal(suffix.status,206);assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),body.subarray(-10));
  assert.equal((await fetch(s.base()+'/media/'+clip.id,{headers:{Range:'bytes=999999999-'}})).status,416);
  const head=await fetch(s.base()+'/media/'+clip.id,{method:'HEAD'});assert.equal(Number(head.headers.get('content-length')),body.length);
  assert.equal((await fetch(s.base()+'/api/clips/'+clip.id,{method:'DELETE',headers:{Authorization:'Bearer wrong'}})).status,403);
  assert.equal((await fetch(s.base()+'/api/clips/'+clip.id,{method:'DELETE',headers:{Authorization:`Bearer ${clip.manageToken}`}})).status,200);
  await s.restart();assert.equal((await fetch(s.base()+'/s/'+clip.id)).status,404);assert.deepEqual(await readdir(s.dataDir),[]);
});
test('auth, consent, origin, media signature, upload size and quota boundaries',async t=>{
  const s=await setup(t,{maxBytes:10000,storageBytes:600000}),body=video();
  assert.equal((await upload(s.base(),body,{Authorization:''})).status,401);
  assert.equal((await upload(s.base(),body,{'X-Sharing-Consent':''})).status,400);
  assert.equal((await upload(s.base(),body,{Origin:'https://evil.example'})).status,403);
  assert.equal((await upload(s.base(),body,{'Content-Type':'text/html'})).status,415);
  assert.equal((await upload(s.base(),Buffer.from('not a video'))).status,415);
  assert.equal((await upload(s.base(),Buffer.alloc(11000))).status,413);
  assert.deepEqual(await readdir(s.dataDir),[]);
  const tiny=await setup(t,{storageBytes:1});assert.equal((await upload(tiny.base(),body)).status,507);
});
test('streaming WebM without container duration works; long clips rejected',async t=>{
  const s=await setup(t);
  const response=await upload(s.base(),video('webm'),{'Content-Type':'video/webm'});assert.equal(response.status,201,await response.clone().text());assert.ok((await response.json()).duration>0);
  assert.equal((await upload(s.base(),video('mp4',61))).status,422);
});
test('expiry rejects all reads and startup removes expired and abandoned files',async t=>{
  let now=1000;const s=await setup(t,{ttlMs:1000,now:()=>now});
  const response=await upload(s.base(),video());const clip=await response.json();now=2001;
  for(const prefix of ['s','media','poster','api/clips'])assert.equal((await fetch(s.base()+`/${prefix}/`+clip.id)).status,404);
  await writeFile(path.join(s.dataDir,'a'.repeat(32)+'.part'),'incomplete');await s.restart();assert.deepEqual(await readdir(s.dataDir),[]);
});
