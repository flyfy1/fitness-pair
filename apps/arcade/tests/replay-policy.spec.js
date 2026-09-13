import {openReplay} from './open-replay.js';
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {movingCamera} from './moving-camera.js';

async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
 const r=indexedDB.open('fitness-pair-clips',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('clips').objectStore('clips').getAll();q.onsuccess=()=>{db.close();resolve(q.result.map(({blob,conversation,...clip})=>({...clip,size:blob.size})));};};
}));}
async function pixels(video){await openReplay(video);return video.evaluate(async v=>{
 if(v.readyState<2)await new Promise(r=>v.addEventListener('loadeddata',r,{once:true}));
 const c=document.createElement('canvas');c.width=1280;c.height=800;const ctx=c.getContext('2d');
 const sample=async time=>{await new Promise(r=>{v.addEventListener('seeked',r,{once:true});v.currentTime=time;});ctx.drawImage(v,0,0,1280,800);return [...ctx.getImageData(10,750,1,1).data];};
 return {width:v.videoWidth,height:v.videoHeight,duration:v.duration,first:await sample(.2),last:await sample(v.duration-.15)};
});}
const yellow=p=>p[0]>200&&p[1]>200&&p[2]<100;

test('native replay keeps the game in view; only Share scrolls; three rounds retain two unbranded videos',async({page},info)=>{
 test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();
 const ids=[];
 for(let round=0;round<3;round++){
  await game.locator('#start').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
  await expect(game.locator('[data-replay-share]')).toBeVisible({timeout:25000});
  await expect(page.locator('#record-status')).toContainText('Saved on this device');
  expect(await page.evaluate(()=>scrollY)).toBe(0);
  await expect(game.locator('#start')).toBeInViewport();
  const clips=await stored(page);expect(clips).toHaveLength(Math.min(round+1,2));
  ids.push(clips.sort((a,b)=>b.createdAt-a.createdAt)[0].id);
  expect(clips.every(c=>c.branded===false&&!c.hasEnding)).toBe(true);
 }
 const clips=await stored(page);expect(clips.map(c=>c.id).sort()).toEqual(ids.slice(1).sort());
 await expect(page.locator('#local-result .clip-card')).toHaveCount(2);
 await page.screenshot({path:info.outputPath('end-stays-in-game.png')});
 await game.locator('[data-replay-share]').click();
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);
 const card=page.locator(`[data-clip-id="${ids.at(-1)}"]`),video=card.locator('video');
 const raw=await pixels(video);expect(raw.height).toBeGreaterThan(raw.width);
 const box=await video.boundingBox();expect(box.height).toBeGreaterThan(box.width);
 expect(yellow(raw.first)).toBe(false);expect(yellow(raw.last)).toBe(false);
 const originalBytes=await video.evaluate(async v=>[...new Uint8Array(await(await fetch(v.src)).arrayBuffer())]);
 let uploaded=null;
 await page.route('**/api/config',r=>r.fulfill({json:{sharingEnabled:true}}));
 await page.route('**/api/auth/session',r=>r.fulfill({json:{enabled:true,user:{email:'synthetic@example.test'},csrfToken:'test-only'}}));
 await page.route('**/api/account/clips',r=>r.fulfill({json:{clips:[],usedBytes:0,limitBytes:2e9}}));
 await page.route('**/api/clips/*',r=>{uploaded=r.request().postDataBuffer();return r.fulfill({json:{url:'/clips/test-only'}});});
 await card.getByRole('button',{name:'Publish to gallery',exact:true}).click();
 await card.locator('input[name=consent]').check();
 await card.getByRole('button',{name:'Publish this clip',exact:false}).click();
 await expect(card.getByRole('link',{name:'Open your gallery page',exact:false})).toBeVisible();
 expect(uploaded).toEqual(Buffer.from(originalBytes));
 const before=(await stored(page)).map(c=>c.id).sort();
 const download=page.waitForEvent('download',{timeout:25000});await card.locator('.clip-actions [download]').click();
 const file=await download;const filePath=info.outputPath('branded-download.mp4');await file.saveAs(filePath);
 const bytes=await readFile(filePath);
 await video.evaluate((v,bytes)=>{v.src=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'video/mp4'}));},[...bytes]);
 const branded=await pixels(video);expect([branded.width,branded.height]).toEqual([raw.width,raw.height]);expect(yellow(branded.first)).toBe(true);expect(yellow(branded.last)).toBe(true);expect(branded.duration).toBeGreaterThan(raw.duration+2.5);
 expect((await stored(page)).map(c=>c.id).sort()).toEqual(before);
 await page.goto('/library');await expect(page.locator('.clip-card')).toHaveCount(2);
 const persisted=await pixels(page.locator('.clip-card video').first());expect(yellow(persisted.first)).toBe(false);expect(yellow(persisted.last)).toBe(false);
 expect(errors).toEqual([]);
});

test('a real portrait recording over 30 seconds is saved at 2x with audio and no promotional ending',async({page},info)=>{
 test.setTimeout(90000);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');await game.locator('#demo').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 // Keep a real browser recorder running, then finish through the real five-action UI.
 await page.waitForTimeout(28500);
 for(let i=0;i<5;i++)await game.locator('#demo-action').press('Space',{delay:750});
 await expect(game.locator('#victory')).toBeVisible({timeout:7000});
 await expect(page.locator('#record-status')).toContainText('2× speed');
 expect(await page.evaluate(()=>scrollY)).toBe(0);
 await game.locator('[data-replay-share]').click();
 await expect(page.locator('#local-result .clip-card')).toHaveCount(1,{timeout:30000});
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);
 const [clip]=await stored(page);expect(clip.playbackRate).toBe(2);expect(clip.sourceDuration).toBeGreaterThan(30);
 expect(clip.duration).toBeGreaterThan(clip.sourceDuration/2-1);expect(clip.duration).toBeLessThan(clip.sourceDuration/2+1);
 const video=page.locator('#local-result video'),result=await pixels(video);
 expect(result.height).toBeGreaterThan(result.width);expect([result.width,result.height]).toEqual([clip.width,clip.height]);
 expect(result.duration).toBeGreaterThan(clip.sourceDuration/2-1);expect(result.duration).toBeLessThan(clip.sourceDuration/2+1);
 expect(yellow(result.first)).toBe(false);expect(yellow(result.last)).toBe(false);
 const audio=await video.evaluate(async v=>{const context=new AudioContext();try{const buffer=await context.decodeAudioData(await(await fetch(v.src)).arrayBuffer());const values=buffer.getChannelData(0);return Math.sqrt(values.reduce((n,x)=>n+x*x,0)/values.length);}finally{await context.close();}});
 expect(audio).toBeGreaterThan(.0001);
 await info.attach('encoded-duration',{body:JSON.stringify({source:clip.sourceDuration,metadata:clip.duration,decoded:result.duration,audioRMS:audio}),contentType:'application/json'});
});

test('existing libraries and simultaneous saves keep two newest clips; stale updates cannot restore evicted videos',async({page})=>{
 const source=await readFile(new URL('../src/local-clips.js',import.meta.url),'utf8');
 await page.route('**/__test-local-clips.js',route=>route.fulfill({contentType:'text/javascript',body:source}));
 await page.goto('/library');
 const result=await page.evaluate(async()=>{
  const {saveClip,listClips,updateClip}=await import('/__test-local-clips.js');
  const make=n=>({id:'clip-'+n,createdAt:n,blob:new Blob(['test'],{type:'video/mp4'})});
  await new Promise(resolve=>{const r=indexedDB.open('fitness-pair-clips',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('clips','readwrite');for(let i=1;i<=5;i++)t.objectStore('clips').put(make(i));t.oncomplete=()=>{db.close();resolve();};};});
  const migrated=(await listClips()).map(c=>c.id);
  await Promise.all([saveClip(make(8)),saveClip(make(6)),saveClip(make(7))]);
  await updateClip(make(1));
  const final=(await listClips()).map(c=>c.id);
  return {migrated,final};
 });
 expect(result).toEqual({migrated:['clip-5','clip-4'],final:['clip-8','clip-7']});
});

test('Replay cancels a Share request while the previous recording is still saving',async({page})=>{
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  const stop=MediaRecorder.prototype.stop;
  MediaRecorder.prototype.stop=function(){const saved=this.onstop;this.onstop=async event=>{await new Promise(resolve=>setTimeout(resolve,2000));await saved?.call(this,event);};return stop.call(this);};
 });
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await expect(game.locator('[data-replay-share]')).toBeVisible({timeout:15000});
 await game.locator('[data-replay-share]').click();await expect(game.locator('[data-replay-share]')).toHaveText('Preparing video…');
 await game.locator('#start').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#local-result video')).toHaveCount(1,{timeout:4000});
 expect(await page.evaluate(()=>scrollY)).toBe(0);await expect(game.locator('[data-replay-share]')).toBeHidden();
});


test('recording orientation is fixed per round and changes for the next round after rotation',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');await page.waitForTimeout(700);
 await page.setViewportSize({width:844,height:390});
 await expect(page.locator('#local-result video')).toHaveCount(1,{timeout:15000});
 const portrait=await pixels(page.locator('#local-result video'));expect(portrait.height).toBeGreaterThan(portrait.width);
 await game.locator('#start').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#local-result video')).toHaveCount(2,{timeout:15000});
 const landscape=await pixels(page.locator('#local-result video').last());expect(landscape.width).toBeGreaterThan(landscape.height);
 await page.goto('/library');await expect(page.locator('.clip-card video')).toHaveCount(2);
 const recent=await pixels(page.locator('.clip-card video').first()),previous=await pixels(page.locator('.clip-card video').last());
 expect([recent.width,recent.height]).toEqual([landscape.width,landscape.height]);
 expect([previous.width,previous.height]).toEqual([portrait.width,portrait.height]);
});


test('portrait camera gameplay fills a portrait replay with the moving camera image intact',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await movingCamera(page);
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:12000});
 await expect(page.locator('#local-result video')).toHaveCount(1,{timeout:25000});
 await game.locator('[data-replay-share]').click();
 const video=page.locator('#local-result video');const result=await pixels(video);
 expect(result.height).toBeGreaterThan(result.width);expect(result.width/result.height).toBeCloseTo(390/844,2);
 const coverage=await video.evaluate(async video=>{
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');
  let personCoverage=0,cameraCoverage=0;
  for(const time of [.5,1.2]){
   await new Promise(resolve=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=time;});ctx.drawImage(video,0,0);
   const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let person=0,camera=0;
   for(let i=0;i<data.length;i+=4){if(data[i]>210&&data[i+1]<80&&data[i+2]<100)person++;if(data[i]<70&&data[i+1]>130&&data[i+2]>160)camera++;}
   personCoverage=Math.max(personCoverage,person/(data.length/4));cameraCoverage=Math.max(cameraCoverage,camera/(data.length/4));
  }
  return {person:personCoverage,camera:cameraCoverage};
 });
 expect(coverage.person).toBeGreaterThan(.02);expect(coverage.camera).toBeGreaterThan(.25);
 await expect(video).toBeInViewport();
 await video.screenshot({path:info.outputPath('portrait-camera-preview.png')});
});
