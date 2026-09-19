import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';
test('entry language changes without opening the camera or running inference',async({page})=>{
 await camera(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await game.locator('#entry-language').selectOption('zh');await expect(game.locator('.game-entry-steps')).toContainText('1 · 摄像头');await expect(game.locator('.game-entry-steps')).toContainText('举起左手');
 expect(await game.locator('body').evaluate(()=>({cameras:window.cameraRequests,workers:window.workerCreations}))).toEqual({cameras:0,workers:0});
 await game.locator('#entry-language').selectOption('en');await expect(game.locator('.game-entry-steps')).toContainText('1 · Camera');
});
test('permission denial can retry the same native camera flow, and cancel releases its only worker',async({page})=>{
 await camera(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await game.locator('body').evaluate(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);let attempted=false;navigator.mediaDevices.getUserMedia=(...args)=>{if(!attempted){attempted=true;return Promise.reject(new DOMException('Synthetic denial','NotAllowedError'));}return original(...args);};});
 await game.locator('#start').click();await expect(game.locator('.game-entry')).toHaveCount(0);await expect(game.locator('#start')).toBeEnabled();
 await game.locator('#start').click();await expect(game.locator('.hands-start')).toBeVisible();await game.locator('#stop').click();
 expect(await game.locator('body').evaluate(()=>({cameras:window.cameraRequests,workers:window.workerCreations,stopped:window.startWorker.terminated&&window.startStream.getTracks().every(t=>t.readyState==='ended')}))).toEqual({cameras:1,workers:1,stopped:true});
 await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
});
