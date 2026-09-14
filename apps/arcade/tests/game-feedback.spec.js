import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';
import {syntheticCamera} from '../../integ-ar/tests/synthetic-camera.js';
import {startWithHands} from '../../integ-ar/tests/start-hands.js';

test('stopping an active game shows one-tap feedback and sends the game session facts',async({page})=>{
 let submitted;
 await page.route('**/api/feedback',async route=>{submitted=route.request().postDataJSON();await route.fulfill({status:201,json:{ok:true,id:submitted.id,receivedAt:Date.now()}});});
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await expect(game.locator('[data-stop-game]')).toBeHidden();
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.waitForTimeout(150);await expect(game.getByRole('button',{name:'Stop game',exact:true})).toBeVisible();
 await game.getByRole('button',{name:'Stop game',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(page.getByRole('heading',{name:'How was Dino Run?'})).toBeVisible();
 await page.getByRole('button',{name:'Like',exact:true}).click();
 await expect(dialog.getByRole('status')).toHaveText('Thanks — feedback saved.');
 expect(submitted).toMatchObject({version:1,rating:'up',gameId:'dino-run',sourcePage:'/play/dino-run'});
 expect(submitted.id).toMatch(/^[0-9a-f-]{36}$/);expect(submitted.durationMs).toBeGreaterThanOrEqual(100);expect(submitted.stoppedAt).toBeGreaterThan(0);
 await expect(page.locator('#game-frame')).toHaveAttribute('src','about:blank');
});

test('failed feedback can be retried without changing the event id and the prompt fits a phone',async({page})=>{
 await page.setViewportSize({width:320,height:740});let attempts=[];
 await page.route('**/api/feedback',async route=>{attempts.push(route.request().postDataJSON());await route.fulfill(attempts.length===1?{status:503,json:{error:'Feedback storage is unavailable.'}}:{status:201,json:{ok:true,id:attempts[0].id}});});
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await game.getByRole('button',{name:'Stop game',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Dislike',exact:true}).click();
 await expect(dialog.getByRole('status')).toHaveText('Feedback storage is unavailable.');await dialog.getByRole('button',{name:'Dislike',exact:true}).click();
 await expect(dialog.getByRole('status')).toHaveText('Thanks — feedback saved.');expect(attempts).toHaveLength(2);expect(attempts[1].id).toBe(attempts[0].id);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('stopping a camera game releases its camera, worker and recorder before asking for feedback',async({page})=>{
 await page.addInitScript(()=>{if(window!==top)return;window.recordingStreams=[];const capture=HTMLCanvasElement.prototype.captureStream;HTMLCanvasElement.prototype.captureStream=function(...args){const stream=capture.apply(this,args);window.recordingStreams.push(stream);return stream;};});
 await camera(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.evaluate(()=>{const gameWindow=document.querySelector('#game-frame').contentWindow;window.stoppedGameStream=gameWindow.startStream;window.stoppedGameWorker=gameWindow.startWorker;});
 await game.getByRole('button',{name:'Stop game',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.stoppedGameStream.getTracks().every(track=>track.readyState==='ended')&&window.stoppedGameWorker.terminated)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>window.recordingStreams.length>0&&window.recordingStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended')))).toBe(true);
});

test('shared stop control does not cover native Integ AR controls after a responsive resize',async({page})=>{
 await syntheticCamera(page);await page.goto('/play/ar-breakout');const game=page.frameLocator('#game-frame');await game.locator('#start').click();await startWithHands(game);await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.setViewportSize({width:390,height:844});
 const geometry=await game.locator('body').evaluate(()=>{const box=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};return {stop:box(document.querySelector('[data-stop-game]')),pause:box(document.querySelector('#pause')),mic:box(document.querySelector('[data-conversation]')),tracking:box(document.querySelector('.movement-hud'))};});
 expect(geometry.mic.y).toBeGreaterThanOrEqual(geometry.tracking.y+geometry.tracking.height);expect(geometry.stop.y+geometry.stop.height).toBeLessThan(geometry.pause.y);
 await game.locator('#pause').click();await expect(page.locator('#game-frame')).not.toHaveAttribute('src','about:blank');
});
