import {test,expect} from '@playwright/test';
import {syntheticCamera} from '../../integ-ar/tests/synthetic-camera.js';
import {startWithHands} from '../../integ-ar/tests/start-hands.js';
import {readStoredClip} from './read-stored-clip.js';
import {openReplay} from './open-replay.js';

const state=game=>game.locator('body').evaluate(()=>window.integAR.getState());

test('Brick Pulse keeps one camera round and local replay through two misses, including frozen serve preparation',async({page},info)=>{
 await syntheticCamera(page);
 const errors=[],uploads=[],playSessions=[],telemetry=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{
  if(!['PUT','POST'].includes(request.method()))return;
  const url=new URL(request.url());
  if(url.pathname==='/api/play-sessions')playSessions.push(request.postDataJSON());
  // Production also sends existing page/performance facts. Keep unknown writes
  // in the upload assertion, and bound/check those known telemetry bodies below.
  else if((url.hostname==='www.google-analytics.com'&&url.pathname==='/g/collect')
    || (url.origin===new URL(page.url()).origin&&url.pathname==='/cdn-cgi/rum'))telemetry.push(request);
  else uploads.push(request.url());
 });
 await page.goto('/play/ar-breakout');const game=page.frameLocator('#game-frame');
 await game.locator('#start').click();await startWithHands(game);
 await game.locator('#language').selectOption('zh');
 await expect.poll(async()=>(await state(game)).phase).toBe('playing');
 const initial=await state(game);
 expect(initial.game.lives).toBe(3);expect(initial.game.serveRemainingMs).toBeGreaterThan(0);
 await expect(game.locator('#lives')).toHaveText('3 / 3');
 await expect(game.locator('#lives-hud')).toContainText('生命');
 await expect(game.locator('#cue')).toHaveText(/秒后发球 · 移动到合适的位置/);
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');

 await game.locator('#pause').click();
 const paused=await state(game);expect(paused.phase).toBe('paused');
 await page.waitForTimeout(750);
 expect((await state(game)).game).toEqual(paused.game);
 await game.locator('#pause').click();
 await expect.poll(async()=>(await state(game)).game.lives,{timeout:10000,intervals:[40]}).toBe(2);
 // Inspect real physics without mutating ball position or skipping a serve.
 await game.locator('body').evaluate(()=>{window.poseTest.missing=true;});
 await expect.poll(async()=>(await state(game)).phase).toBe('paused');
 const recovery=await state(game);expect(recovery.pauseReason).toBe('tracking');
 expect(recovery.round).toBe(initial.round);expect(recovery.camera).toBe(true);
 expect(recovery.game.serveRemainingMs).toBeGreaterThan(0);
 expect(recovery.game.score).toBe(0);expect(recovery.game.bricks).toBe(40);
 await expect(game.locator('#lives')).toHaveText('2 / 3');
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');

 // Missing tracking cannot consume a waiting ball or silently restart the round.
 await page.waitForTimeout(350);await game.locator('#pause').click();
 expect((await state(game)).phase).toBe('paused');
 expect((await state(game)).game).toEqual(recovery.game);
 await game.locator('body').evaluate(()=>{window.poseTest.missing=false;});
 await expect(game.locator('#tracking')).toContainText('躯干已跟踪');
 await game.locator('#pause').click();
 await expect.poll(async()=>(await state(game)).game.lives,{timeout:10000,intervals:[40]}).toBe(1);
 expect((await state(game)).round).toBe(initial.round);
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.setViewportSize({width:320,height:844});
 await expect(game.locator('#lives-hud')).toBeInViewport();
 await expect(game.locator('#finish')).toBeInViewport();
 expect(await game.locator('html').evaluate(element=>element.scrollWidth<=innerWidth)).toBe(true);
 const header=await game.locator('.hud').boundingBox(),tracking=await game.locator('.movement-hud').boundingBox();
 expect(header.y+header.height).toBeLessThanOrEqual(tracking.y);
 expect(await game.locator('#lives').evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);return range.getClientRects().length;})).toBe(1);
 await page.screenshot({path:info.outputPath('brick-pulse-one-life-mobile.png')});

 await expect.poll(async()=>(await state(game)).phase,{timeout:10000}).toBe('complete');
 expect((await state(game)).game.lives).toBe(0);
 await expect(page.locator('#local-result video')).toHaveCount(1,{timeout:15000});
 const stored=await readStoredClip(page,'ar-breakout');
 expect(stored.sessionId).toBe(initial.round);expect(stored.tracking.sampleSessionIds).toEqual([initial.round]);
 expect(stored.tracking.durationMs).toBeGreaterThan(10000);
 await openReplay(page.locator('#local-result video'));
 await expect.poll(()=>page.locator('#local-result video').evaluate(video=>Number.isFinite(video.duration)?video.duration:0)).toBeGreaterThan(10);
 expect(await game.locator('body').evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
 expect(uploads).toEqual([]);expect(errors).toEqual([]);
 // Cumulative usage facts may retry on the static preview. A lost life must
 // never create a second play session or add movement/media to those facts.
 expect(new Set(playSessions.map(item=>item.id)).size).toBe(1);
 expect(playSessions.at(-1).endReason).toBe('completed');
 for(const item of playSessions)expect(Object.keys(item).sort()).toEqual(['version','id','gameId','playerId','startedAt','inputSource','sequence','activeMs','updatedAt','endReason'].sort());
 for(const request of telemetry){
  expect(request.headers()['content-type']||'').not.toMatch(/video|audio|octet-stream|multipart/i);
  const body=request.postData()||'';
  expect(Buffer.byteLength(body)).toBeLessThan(64000);
  expect(body).not.toMatch(/"joints"|leftShoulder|rightShoulder|leftHip|data:image|base64|manageToken/);
 }
});
