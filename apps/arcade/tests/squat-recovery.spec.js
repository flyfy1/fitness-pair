import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';

test('synthetic squat recovery keeps the round, rejects collapsed joints and releases its camera on victory',async({page})=>{
 test.setTimeout(60000);
 const errors=[],uploads=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.method()==='PUT'||request.url().includes('/api/direct-uploads/'))uploads.push(request.url());});
 await camera(page);await page.goto('/play/motion-quest');
 const game=page.frameLocator('#game-frame');
 const pose=value=>game.locator('body').evaluate((_,value)=>Object.assign(window.startPose,value),value);
 await game.locator('#start').click();await expect(game.locator('.hands-start')).toBeVisible();
 await pose({hands:'left'});await expect(game.locator('.hands-start-title')).toContainText('lower both');
 await pose({hands:'down'});await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:12000});
 await pose({squat:true,collapseKnees:true});await expect(game.locator('#tracking-badge')).toHaveText('Waiting for full body');
 await page.waitForTimeout(1000);await pose({squat:false,collapseKnees:false});
 await expect(game.locator('#tracking-badge')).toHaveText('Body landmarks detected');
 await expect(game.locator('#rep-count')).toHaveText('0');
 const rep=async count=>{
  await pose({squat:true});await expect(game.locator('#arena-title')).toContainText('Stand to attack');
  await pose({squat:false});await expect(game.locator('#rep-count')).toHaveText(String(count));
 };
 await rep(1);await pose({shift:-.05});
 await expect(game.locator('#tracking-badge')).toHaveText('Calibrating');
 await expect(game.locator('#tracking-badge')).toHaveText('Body landmarks detected');
 await expect(game.locator('#rep-count')).toHaveText('1');
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 expect(await game.locator('body').evaluate(()=>({cameras:window.cameraRequests,workers:window.workerCreations}))).toEqual({cameras:1,workers:1});
 for(let count=2;count<=5;count++)await rep(count);
 await expect(page.locator('#local-result .clip-card')).toBeVisible({timeout:15000});
 expect(await game.locator('body').evaluate(()=>window.startWorker.terminated&&window.startStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
 expect(errors).toEqual([]);expect(uploads).toEqual([]);
});
