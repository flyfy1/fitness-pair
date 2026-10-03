import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';
import {openReplay} from './open-replay.js';

// Synthetic landmarks and video only; no participant camera recording.
test('camera wave approaches, reacts to five actions and keeps the lower camera clear',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:390,height:844});await camera(page);
 const errors=[],uploads=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/g/collect*',r=>r.fulfill({status:204}));await page.route('**/api/play-sessions',r=>r.fulfill({status:201,json:{ok:true}}));
 page.on('request',r=>{if(r.method()==='PUT'||r.url().includes('/api/direct-uploads/'))uploads.push(new URL(r.url()).pathname);});
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame'),canvas=game.locator('#game');
  await game.locator('#start').click();await expect(game.locator('.hands-start')).toBeVisible({timeout:15000});await expect(game.locator('.hands-start-title')).toHaveText('Raise your LEFT hand.');
  await page.waitForTimeout(500);
 await game.locator('body').evaluate(()=>{window.startPose.hands='left';});await expect(game.locator('.hands-start-title')).toHaveText('Now lower both hands.');
 await game.locator('body').evaluate(()=>{window.startPose.hands='down';});await expect(game.locator('.hands-start')).toBeHidden({timeout:10000});
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 const initial=Number(await canvas.getAttribute('data-front-x'));await page.waitForTimeout(1200);
 expect(Number(await canvas.getAttribute('data-front-x'))).toBeLessThan(initial-4);
 const alpha=()=>canvas.evaluate(el=>{
  const data=el.getContext('2d').getImageData(0,Math.floor(el.height*.78),el.width,Math.floor(el.height*.20)).data;
  let occupied=0;for(let i=3;i<data.length;i+=4)if(data[i])occupied++;return occupied;
 });
 expect(await alpha()).toBe(0);await page.screenshot({path:test.info().outputPath('forest-camera-clear.png')});
 for(let rep=1;rep<=5;rep++){
  await game.locator('body').evaluate(()=>{window.startPose.squat=true;});await expect(game.locator('#charge-value')).toHaveText('100%',{timeout:5000});
  await expect(canvas).toHaveAttribute('data-hero-pose','charge');await page.waitForTimeout(150);
  await game.locator('body').evaluate(()=>{window.startPose.squat=false;});await expect(game.locator('#rep-count')).toHaveText(String(rep),{timeout:5000});
  await expect(canvas).toHaveAttribute('data-hero-pose','cast');await expect(canvas).toHaveAttribute('data-guardians-remaining',String(5-rep));
  await expect(canvas).toHaveAttribute('data-effect-phase','impact');
  if(rep===1)await page.screenshot({path:test.info().outputPath('forest-hit.png')});
  await expect(canvas).toHaveAttribute('data-effect-phase','idle');
 }
 expect(await game.locator('body').evaluate(()=>window.startWorker.terminated&&window.startStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
 await page.getByRole('dialog').getByRole('button',{name:'View replay',exact:true}).click();
 const video=page.locator('#local-result video');await expect(video).toHaveCount(1,{timeout:15000});await openReplay(video);await video.evaluate(v=>v.play());
 await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(0);expect(uploads).toEqual([]);expect(errors).toEqual([]);
 await game.locator('#again').click();await expect(game.locator('#rep-count')).toHaveText('0');await expect(canvas).toHaveAttribute('data-guardians-remaining','5');await game.locator('#stop').click();
});

test('preview wave also leaves a transparent canvas in portrait and landscape',async({page})=>{
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');await game.locator('#demo').click();
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1440,height:1000}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(150);
  expect(await game.locator('#game').evaluate(el=>{
   const ctx=el.getContext('2d'),height=Math.floor(el.height*.04),data=ctx.getImageData(0,el.height-height,el.width,height).data;
   return data.every((value,index)=>index%4!==3||value===0);
  })).toBe(true);
  await expect(game.locator('#demo-action')).toBeInViewport();
 }
});
