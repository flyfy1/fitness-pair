import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';
import {openReplay} from './open-replay.js';
test('entry language changes without opening the camera or running inference',async({page})=>{
 await camera(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await game.locator('#entry-language').selectOption('zh');await expect(game.locator('.game-entry-steps')).toContainText('1 · 摄像头');await expect(game.locator('.game-entry-steps')).toContainText('举起左手');
 expect(await game.locator('body').evaluate(()=>({cameras:window.cameraRequests,workers:window.workerCreations}))).toEqual({cameras:0,workers:0});
 await game.locator('#entry-language').selectOption('en');await expect(game.locator('.game-entry-steps')).toContainText('1 · Camera');
});
test('homepage recommendation completes five synthetic actions and returns from a local replay',async({page})=>{
 test.setTimeout(60000);
 const uploads=[];page.on('request',request=>{if(request.method()==='PUT'||request.url().includes('/api/direct-uploads/'))uploads.push(request.url());});
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.locator('.hero-cta').click();await page.getByRole('dialog').getByRole('link',{name:'Let’s play'}).click();
 const game=page.frameLocator('#game-frame');await expect(game.locator('.game-entry')).toBeVisible();
 await game.locator('#demo').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 for(let rep=1;rep<=5;rep++){
  await game.locator('#demo-action').focus();await page.keyboard.down('Space');await page.waitForTimeout(750);await page.keyboard.up('Space');
  await expect(game.locator('#rep-count')).toHaveText(String(rep));
 }
 const card=page.locator('#local-result .clip-card').first();await expect(card).toBeVisible({timeout:15000});
 await openReplay(card.locator('video'));await expect(card.locator('.replay-options')).not.toHaveAttribute('open');
 await card.locator('.replay-options > summary').focus();await page.keyboard.press('Enter');await expect(card.locator('[data-copy]')).toBeVisible();
 await page.keyboard.press('Enter');await expect(card.locator('[data-copy]')).toBeHidden();
 await card.getByRole('button',{name:'Back to game'}).click();await expect(page.locator('#game-frame')).toBeFocused();
 expect(await card.locator('video').evaluate(video=>video.paused)).toBe(true);
 await expect(game.locator('#again')).toBeInViewport();expect(uploads).toEqual([]);
});
test('permission denial can retry the same native camera flow, and cancel releases its only worker',async({page})=>{
 await camera(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await game.locator('body').evaluate(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);let attempted=false;navigator.mediaDevices.getUserMedia=(...args)=>{if(!attempted){attempted=true;return Promise.reject(new DOMException('Synthetic denial','NotAllowedError'));}return original(...args);};});
 await game.locator('#start').click();await expect(game.locator('.game-entry')).toHaveCount(0);await expect(game.locator('#start')).toBeEnabled();
 await game.locator('#start').click();await expect(game.locator('.hands-start')).toBeVisible();await game.locator('#stop').click();
 expect(await game.locator('body').evaluate(()=>({cameras:window.cameraRequests,workers:window.workerCreations,stopped:window.startWorker.terminated&&window.startStream.getTracks().every(t=>t.readyState==='ended')}))).toEqual({cameras:1,workers:1,stopped:true});
 await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
});
