import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function previewRound(page){
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');await game.locator('#demo').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');await page.waitForTimeout(1200);
 await page.evaluate(()=>{const w=document.querySelector('#game-frame').contentWindow;w.motionQuest.getReplayState=()=>({roundId:w.document.documentElement.dataset.roundId,phase:'complete'});});
 await expect(page.locator('#local-result video')).toBeVisible({timeout:7000});
}

test('share copy is local, previewed, and uploaded only after explicit publication; clip page plays returned bytes',async({page})=>{
 let uploaded=null,metadata=null,uploadCount=0;
 await page.route('**/api/config',route=>route.fulfill({json:{sharingEnabled:true}}));
 await page.route('**/api/clips/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='PUT'){
   uploadCount++;expect(request.headers()['x-sharing-consent']).toBe('gallery-v1');expect(request.headers().authorization).toBe('Bearer synthetic-upload-code');expect(request.headers()['x-management-key'].length).toBeGreaterThan(32);
   uploaded=request.postDataBuffer();expect(uploaded.subarray(4,8).toString()).toBe('ftyp');expect(uploaded.length).toBeLessThanOrEqual(20*1024*1024);
   const id=url.pathname.split('/').at(-1);metadata={id,title:url.searchParams.get('title'),game:'motion-quest',source:'synthetic',mime:'video/mp4',duration:Number(url.searchParams.get('duration')),expiresAt:Date.now()+86400000,url:'/clips/'+id};
   expect(metadata.duration).toBeLessThanOrEqual(60);await route.fulfill({status:201,json:metadata});
  }else await route.fulfill({json:metadata});
 });
 await page.route('**/api/media/*',async route=>{
  const range=route.request().headers().range;const headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes'};
  if(range){const match=/bytes=(\d+)-(\d*)/.exec(range),start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),uploaded.length-1):uploaded.length-1;await route.fulfill({status:206,body:uploaded.subarray(start,end+1),headers:{...headers,'Content-Range':`bytes ${start}-${end}/${uploaded.length}`}});}
  else await route.fulfill({body:uploaded,headers});
 });
 await previewRound(page);const original=page.locator('#local-result .clip-card').first();
 await original.getByRole('button',{name:'Make short share copy',exact:true}).click();
 await expect(page.locator('#local-result .clip-card')).toHaveCount(2,{timeout:12000});
 const copy=page.locator('#local-result .clip-card').nth(1);await expect(copy).toContainText('MP4');
 expect(uploadCount).toBe(0);await copy.locator('video').evaluate(v=>v.play());await expect.poll(()=>copy.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);
 await copy.getByRole('button',{name:'Publish to gallery',exact:true}).click();
 await expect(copy.locator('form')).toBeVisible();expect(uploadCount).toBe(0);
 await copy.getByLabel('Early-access upload code').fill('synthetic-upload-code');await copy.locator('input[name=consent]').check();expect(uploadCount).toBe(0);
 await copy.getByRole('button',{name:'Publish this clip'}).click();await expect(copy.getByRole('link',{name:'Open your gallery page'})).toBeVisible();expect(uploadCount).toBe(1);
 await copy.getByRole('link',{name:'Open your gallery page'}).click();await expect(page.locator('.clip-view video')).toBeVisible();await page.locator('.clip-view video').evaluate(v=>v.play());await expect.poll(()=>page.locator('.clip-view video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);
 await expect(page.getByRole('button',{name:'Remove shared clip'})).toBeVisible();
 await page.goto('/library');await expect(page.locator('.clip-card')).toHaveCount(2);
});

test('cancelling or backgrounding a share copy releases capture tracks and retains original',async({page})=>{
 await page.addInitScript(()=>{if(window!==window.top)return;window.captures=[];const capture=HTMLCanvasElement.prototype.captureStream;HTMLCanvasElement.prototype.captureStream=function(...args){const stream=capture.apply(this,args);window.captures.push(stream);return stream;};});
 await previewRound(page);const card=page.locator('#local-result .clip-card');
 await card.getByRole('button',{name:'Make short share copy'}).click();await expect(card.getByRole('button',{name:'Cancel copy'})).toBeVisible();await card.getByRole('button',{name:'Cancel copy'}).click();
 await expect(card).toContainText('Share copy cancelled');await expect(page.locator('#local-result .clip-card')).toHaveCount(1);
 await expect.poll(()=>page.evaluate(()=>window.captures.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
 await card.getByRole('button',{name:'Make short share copy'}).click();await page.waitForTimeout(500);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(card).toContainText('Keep this tab visible');await expect.poll(()=>page.evaluate(()=>window.captures.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
});

test('long real media produces a bounded branded share copy without replacing original',async({page})=>{
 test.skip(!process.env.HOPMODO_LONG_CLIP,'Optional generated 70-second synthetic MP4 fixture; see RECORDING.md.');test.setTimeout(90000);
 const bytes=await readFile(process.env.HOPMODO_LONG_CLIP);await page.goto('/library');
 await page.evaluate(async bytes=>{const blob=new Blob([new Uint8Array(bytes)],{type:'video/mp4'});await new Promise((resolve,reject)=>{const request=indexedDB.open('fitness-pair-clips',1);request.onupgradeneeded=()=>request.result.createObjectStore('clips',{keyPath:'id'});request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('clips','readwrite');tx.objectStore('clips').put({id:crypto.randomUUID(),title:'Motion Quest · long synthetic fixture',game:'motion-quest',gameTitle:'Motion Quest',source:'synthetic',includesCamera:true,createdAt:Date.now(),duration:70,blob});tx.oncomplete=()=>{db.close();resolve();};};});},[...bytes]);
 await page.reload();const original=page.locator('.clip-card').first();await original.getByRole('button',{name:'Make short share copy'}).click();
 await expect(page.locator('.clip-card')).toHaveCount(2,{timeout:70000});const copy=page.locator('.clip-card').nth(1);
 const result=await copy.locator('video').evaluate(async video=>{if(video.readyState<2)await new Promise(r=>video.addEventListener('loadeddata',r,{once:true}));const blob=await (await fetch(video.src)).blob();video.currentTime=video.duration-.2;await new Promise(r=>video.addEventListener('seeked',r,{once:true}));const c=document.createElement('canvas');c.width=1280;c.height=800;const ctx=c.getContext('2d');ctx.drawImage(video,0,0);const pixel=[...ctx.getImageData(5,5,1,1).data];return {duration:video.duration,size:blob.size,type:blob.type,pixel};});
 expect(result.duration).toBeGreaterThan(56);expect(result.duration).toBeLessThanOrEqual(60);expect(result.size).toBeLessThanOrEqual(20*1024*1024);expect(result.type).toBe('video/mp4');expect(result.pixel[0]).toBeGreaterThan(200);expect(result.pixel[1]).toBeGreaterThan(200);expect(result.pixel[2]).toBeLessThan(100);
 await page.reload();await expect(page.locator('.clip-card')).toHaveCount(2);await expect(page.getByRole('heading',{name:'Motion Quest · long synthetic fixture'})).toBeVisible();
});
