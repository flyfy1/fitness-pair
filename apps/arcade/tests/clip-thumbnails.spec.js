import {test,expect} from '@playwright/test';

async function recordSyntheticRound(page){
 await page.goto('/play/motion-quest');
 await page.frameLocator('#game-frame').locator('#demo').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.waitForTimeout(900);
 await page.evaluate(()=>{const w=document.querySelector('#game-frame').contentWindow;w.motionQuest.getReplayState=()=>({roundId:w.document.documentElement.dataset.roundId,phase:'complete'});});
 await expect(page.locator('.clip-card')).toHaveCount(1);
}
async function savedThumbnails(page){
 return page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('fitness-pair-clips',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const clips=await new Promise((resolve,reject)=>{const r=db.transaction('clips').objectStore('clips').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();
  return Promise.all(clips.map(async clip=>{const image=await createImageBitmap(clip.thumbnail);const result={id:clip.id,size:clip.thumbnail.size,type:clip.thumbnail.type,width:image.width,height:image.height,videoWidth:clip.width,videoHeight:clip.height};image.close();return result;}));
 });
}

test('new replays and share copies persist first-frame thumbnails and load only the clicked video',async({page},info)=>{
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  window.replayLoads=[];
  document.addEventListener('loadstart',event=>{if(event.target.closest?.('.clip-card'))window.replayLoads.push(event.target.currentSrc||event.target.src);},true);
 });
 await recordSyntheticRound(page);
 const first=page.locator('.clip-card').first();
 await expect(first.locator('video')).not.toHaveAttribute('src');
 await expect(first.locator('video')).toHaveAttribute('poster',/^blob:/);
 let thumbnails=await savedThumbnails(page);expect(thumbnails).toHaveLength(1);
 for(const t of thumbnails){expect(t.type).toBe('image/jpeg');expect(t.size).toBeGreaterThan(100);expect(Math.max(t.width,t.height)).toBeLessThanOrEqual(480);expect(Math.abs(t.width/t.height-t.videoWidth/t.videoHeight)).toBeLessThan(.01);}
 await first.getByRole('button',{name:'Make short share copy',exact:true}).click();
 await expect(page.locator('.clip-card')).toHaveCount(2,{timeout:12000});
 thumbnails=await savedThumbnails(page);expect(thumbnails).toHaveLength(2);expect(thumbnails.every(t=>t.type==='image/jpeg'&&t.size>100)).toBe(true);
 await page.goto('/library');await page.reload();
 const videos=page.locator('.clip-card video');await expect(videos).toHaveCount(2);
 await expect(videos.first()).toHaveAttribute('poster',/^blob:/);
 await expect(videos.nth(1)).toHaveAttribute('poster',/^blob:/);
 await page.waitForTimeout(500);
 expect(await videos.evaluateAll(items=>items.map(v=>({src:v.getAttribute('src'),state:v.readyState})))).toEqual([{src:null,state:0},{src:null,state:0}]);
 expect(await page.evaluate(()=>window.replayLoads)).toEqual([]);
 await page.screenshot({path:info.outputPath('desktop-thumbnails.png')});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('mobile-thumbnails.png')});
 await page.locator('.clip-preview-play').first().press('Enter');
 await expect.poll(()=>videos.first().evaluate(v=>v.currentTime)).toBeGreaterThan(0);
 await expect(videos.nth(1)).not.toHaveAttribute('src');
 expect(await page.evaluate(()=>window.replayLoads.length)).toBe(1);
 const imageCheck=await videos.first().evaluate(async video=>{
  video.pause();
  // Compare against the beginning, not whichever later frame the card was opened on.
  if(video.currentTime!==0){const seek=new Promise(r=>video.addEventListener('seeked',r,{once:true}));video.currentTime=0;await seek;}
  const image=await createImageBitmap(await(await fetch(video.poster)).blob());
  const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const still=ctx.getImageData(0,0,c.width,c.height).data;
  ctx.drawImage(video,0,0,c.width,c.height);const frame=ctx.getImageData(0,0,c.width,c.height).data;let delta=0;for(let i=0;i<still.length;i++)if(i%4!==3)delta+=Math.abs(still[i]-frame[i]);image.close();return delta/(still.length*.75);
 });
 expect(imageCheck).toBeLessThan(20);
 const released=await videos.first().evaluate(v=>[v.src,v.poster]);
 await page.locator('.clip-card').first().getByRole('button',{name:'Delete local clip',exact:true}).click();
 await expect(page.locator('.clip-card')).toHaveCount(1);
 expect(await page.evaluate(urls=>Promise.all(urls.map(url=>fetch(url).then(()=>false,()=>true))),released)).toEqual([true,true]);
 await expect(page.locator('.clip-card video')).not.toHaveAttribute('src');
});

test('legacy clips have a keyboard-accessible placeholder and do not decode while browsing',async({page})=>{
 await recordSyntheticRound(page);
 await page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('fitness-pair-clips',1);r.onsuccess=()=>resolve(r.result);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('clips','readwrite'),store=tx.objectStore('clips');const r=store.getAll();r.onsuccess=()=>{for(const clip of r.result){delete clip.thumbnail;store.put(clip);}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 });
 await page.goto('/library');
 const video=page.locator('.clip-card video');await expect(video).toBeVisible();await expect(video).not.toHaveAttribute('poster');await expect(video).not.toHaveAttribute('src');
 await page.getByRole('button',{name:/Play replay:/}).press('Enter');
 await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(0);
});


test('thumbnail encoding failure preserves a playable saved recording',async({page})=>{
 await page.addInitScript(()=>{if(window===window.top)HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};});
 await recordSyntheticRound(page);await page.goto('/library');
 const video=page.locator('.clip-card video');await expect(video).not.toHaveAttribute('src');await expect(video).not.toHaveAttribute('poster');
 await page.getByRole('button',{name:/Play replay:/}).click();await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(0);
});
