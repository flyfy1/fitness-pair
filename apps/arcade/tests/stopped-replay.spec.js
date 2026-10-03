import {test,expect} from '@playwright/test';
import {syntheticCamera as jumpCamera,confirmWithHand} from '../../camera-start/tests/browser/synthetic-camera.js';
import {syntheticCamera as flightCamera} from '../../../experiments/gameplay/plank-flight/tests/browser/synthetic-camera.js';
import {syntheticCamera as arCamera} from '../../integ-ar/tests/synthetic-camera.js';
import {startWithHands} from '../../integ-ar/tests/start-hands.js';
import {openReplay} from './open-replay.js';
import {readStoredClip} from './read-stored-clip.js';

async function observe(page){
 const errors=[],uploads=[];page.on('pageerror',e=>errors.push(e.message));
 for(const pattern of ['**/g/collect*','**/cdn-cgi/rum*'])await page.route(pattern,r=>r.fulfill({status:204}));
 await page.route('**/api/play-sessions',r=>r.fulfill({status:201,json:{ok:true}}));
 page.on('request',r=>{if(['POST','PUT'].includes(r.method())&&!['/api/play-sessions','/g/collect','/cdn-cgi/rum'].includes(new URL(r.url()).pathname))uploads.push(r.url());});
 return {errors,uploads};
}
for(const id of ['motion-quest','jump-game','plank-flight','ar-breakout'])test(`${id}: shared Stop releases resources and offers the durable local partial replay`,async({page},info)=>{
 test.setTimeout(60000);const observed=await observe(page);
 await page.addInitScript(()=>{if(window!==top)return;window.recordingStreams=[];const capture=HTMLCanvasElement.prototype.captureStream;HTMLCanvasElement.prototype.captureStream=function(...args){const stream=capture.apply(this,args);window.recordingStreams.push(stream);return stream;};});
 if(id==='jump-game')await jumpCamera(page);else if(id==='plank-flight')await flightCamera(page);else if(id==='ar-breakout')await arCamera(page);
 await page.setViewportSize({width:390,height:844});await page.goto('/play/'+id);const game=page.frameLocator('#game-frame');
 if(id==='motion-quest')await game.locator('#demo').click();
 else{
  await game.locator(id==='jump-game'?'#primary':'#start').click();
  if(id==='jump-game'){await expect(game.locator('#instruction')).toHaveText('Raise your LEFT hand.',{timeout:12000});await confirmWithHand(game);}
  else if(id==='ar-breakout')await startWithHands(game);
 }
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 if(id==='jump-game')await game.locator('#primary').click();
 else if(id==='ar-breakout')await game.locator('#pause').click();
 else if(id==='plank-flight'){await game.locator('body').evaluate(()=>window.testMissing=true);await expect.poll(()=>game.locator('body').evaluate(()=>window.plankFlight.getState().status)).toBe('paused');}
 await page.waitForTimeout(600);
 await page.evaluate(()=>{const w=document.querySelector('#game-frame').contentWindow;window.stoppedStream=w.testStream;window.stoppedWorker=w.testWorker;});
 await game.locator('[data-stop-game]').click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(page.locator('#game-frame')).toHaveAttribute('src','about:blank');
 await expect.poll(()=>page.evaluate(()=>window.recordingStreams.length>0&&window.recordingStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
 if(id!=='motion-quest')expect(await page.evaluate(()=>window.stoppedWorker.terminated&&window.stoppedStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
 await expect(page.locator('#local-result video')).toHaveCount(1,{timeout:15000});
 const clip=await readStoredClip(page,id);expect(clip.sessionId).toMatch(/^[0-9a-f-]{36}$/);if(id!=='motion-quest')expect(clip.tracking.sampleCount).toBeGreaterThan(0);
 const video=page.locator('#local-result video');expect(await video.getAttribute('src')).toBeNull();
 await expect(dialog.locator('[data-view-replay]')).toBeEnabled();await dialog.locator('[data-view-replay]').click();await expect(dialog).toBeHidden();
 await expect(page.locator('#local-result .clip-card > h3')).toBeInViewport();await openReplay(video);await video.evaluate(v=>v.play());await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath('stopped-replay.png')});
 await expect(page.locator('.replay-return')).toHaveText('Play again');
 if(id==='motion-quest'){await page.locator('.replay-return').click();await expect(page.frameLocator('#game-frame').locator('.game-entry')).toBeVisible();await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');}
 expect(observed.errors).toEqual([]);expect(observed.uploads).toEqual([]);
});

test('shared Stop remains usable when this browser cannot record a replay',async({page})=>{
 const observed=await observe(page);await page.addInitScript(()=>{if(window===top)window.MediaRecorder=undefined;});
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');await game.locator('#demo').click();await expect(game.locator('[data-stop-game]')).toBeVisible();await game.locator('[data-stop-game]').click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('[data-view-replay]')).toBeDisabled();await expect(dialog.locator('[data-view-replay]')).toHaveText('Video unavailable');await expect(dialog.locator('[data-play-again]')).toBeEnabled();
 expect(observed.errors).toEqual([]);expect(observed.uploads).toEqual([]);
});
