import {test,expect} from '@playwright/test';

async function recording(page){
 await page.goto('/play/motion-quest');await page.frameLocator('#game-frame').locator('#demo').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');await page.waitForTimeout(900);
 await page.evaluate(()=>{const w=document.querySelector('#game-frame').contentWindow;w.motionQuest.getReplayState=()=>({roundId:w.document.documentElement.dataset.roundId,phase:'complete'});});
 await expect(page.locator('.clip-card')).toHaveCount(1);
}
async function inspectStored(page,removeThumbnail=false){
 return page.evaluate(async remove=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('fitness-pair-clips',1);r.onsuccess=()=>resolve(r.result);});
  const clips=await new Promise(resolve=>{const tx=db.transaction('clips',remove?'readwrite':'readonly'),store=tx.objectStore('clips'),r=store.getAll();r.onsuccess=()=>{if(remove)for(const c of r.result){delete c.thumbnail;c.backfillMarker='preserve-me';store.put(c);}};tx.oncomplete=()=>resolve(r.result);});db.close();
  return Promise.all(clips.map(async c=>({id:c.id,duration:c.duration,size:c.blob.size,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await c.blob.arrayBuffer()))].join(','),marker:c.backfillMarker,thumbnailBytes:c.thumbnail?.size||0})));
 },removeThumbnail);
}

test('explicit legacy thumbnail repair preserves video bytes and metadata across reload',async({page})=>{
 await recording(page);const before=await inspectStored(page,true);await page.goto('/library');
 const video=page.locator('.clip-card video');await expect(video).not.toHaveAttribute('src');await expect(video).not.toHaveAttribute('poster');
 await page.getByRole('button',{name:'Generate thumbnail',exact:true}).click();
 await expect(page.getByText('Thumbnail saved. Your original video is unchanged.')).toBeVisible();
 const after=await inspectStored(page);expect(after[0].thumbnailBytes).toBeGreaterThan(100);
 expect({...after[0],thumbnailBytes:0}).toEqual(before[0]);
 await expect(video).not.toHaveAttribute('src');await expect(video).toHaveAttribute('poster',/^blob:/);
 await page.reload();await expect(page.getByRole('button',{name:'Generate thumbnail',exact:true})).toHaveCount(0);
 await expect(video).toHaveAttribute('poster',/^blob:/);await expect(video).not.toHaveAttribute('src');
});

test('publication sends a JPEG and shared surfaces request only posters before playback',async({page})=>{
 let clip=null,media=null,poster=null;const videoRequests=[];
 await page.route('**/api/config',r=>r.fulfill({json:{sharingEnabled:true}}));
 await page.route('**/api/auth/session',r=>r.fulfill({json:{enabled:true,user:{email:'synthetic@example.test'},csrfToken:'test-only'}}));
 await page.route('**/api/account/clips',r=>r.fulfill({json:{clips:clip?[clip]:[],usedBytes:media?.length||0,limitBytes:2e9}}));
 await page.route('**/api/clips',r=>r.fulfill({json:{enabled:true,clips:clip?[clip]:[]}}));
 await page.route('**/api/clips/*',r=>{
  const req=r.request(),url=new URL(req.url());
  if(req.method()==='PUT'){media=req.postDataBuffer();clip={id:url.pathname.split('/').at(-1),title:'Synthetic published replay',game:'motion-quest',source:'synthetic',bytes:media.length,expiresAt:Date.now()+86400000};}
  return r.fulfill({json:clip?{...clip,url:'/clips/'+clip.id}:null});
 });
 await page.route('**/api/posters/*',r=>{
  const req=r.request();
  if(req.method()==='PUT'){expect(req.headers()['x-csrf-token']).toBe('test-only');expect(req.headers()['content-type']).toBe('image/jpeg');poster=req.postDataBuffer();expect([...poster.subarray(0,2)]).toEqual([255,216]);return r.fulfill({json:{url:'/api/posters/'+clip.id}});}
  return r.fulfill({contentType:'image/jpeg',body:poster});
 });
 await page.route('**/api/media/*',r=>{videoRequests.push(r.request().url());return r.fulfill({contentType:'video/mp4',body:media});});
 await recording(page);
 await page.getByRole('button',{name:'Publish to gallery',exact:true}).click();await page.locator('input[name=consent]').check();
 await page.getByRole('button',{name:'Publish this clip',exact:false}).click();await expect(page.getByRole('link',{name:'Open your gallery page',exact:false})).toBeVisible();
 expect(poster.length).toBeGreaterThan(100);expect(videoRequests).toHaveLength(0);
 for(const path of ['/gallery','/shared','/clips/'+clip.id]){
  await page.goto(path);const video=page.locator('.clip-preview video');
  await expect(video).toHaveAttribute('poster','/api/posters/'+clip.id);await expect(video).not.toHaveAttribute('src');
  await page.waitForTimeout(200);expect(videoRequests).toHaveLength(0);
 }
 await page.getByRole('button',{name:/Play replay:/}).click();
 await expect.poll(()=>page.locator('.clip-preview video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);expect(videoRequests.length).toBeGreaterThan(0);
});
