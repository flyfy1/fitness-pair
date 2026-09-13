import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';
test('Motion Quest start yields to calibration, five squats and retry',async({page},info)=>{
 await camera(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 const pose=value=>game.locator('body').evaluate((_,v)=>Object.assign(window.startPose,v),value);
 await game.locator('#start').click();await expect(game.locator('.hands-start')).toBeVisible();
 await expect(game.locator('.arena-message')).toBeHidden();
 const style=await game.locator('.hands-start').evaluate(el=>({background:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage}));
 expect(style).toEqual({background:'rgba(0, 0, 0, 0)',image:'none'});
 await pose({squat:true});await page.waitForTimeout(1000);await pose({squat:false});await page.waitForTimeout(1000);
 await expect(game.locator('#rep-count')).toHaveText('0');await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 await pose({hands:'both'});await expect(game.locator('.hands-start-title')).toContainText('lower both');
 await page.screenshot({path:info.outputPath('transparent-start.png')});await pose({hands:'down'});
 await expect(game.locator('.hands-start')).toBeHidden();await expect(game.locator('#arena-title')).toHaveText('Hold still');
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');await expect(game.locator('#arena-title')).toHaveText('Squat down');
 await pose({hideHands:true});
 for(let i=1;i<=5;i++){
  await pose({squat:true});await expect(game.locator('#charge-value')).toHaveText('100%');await page.waitForTimeout(350);
  await expect(game.locator('#rep-count')).toHaveText(String(i-1));await pose({squat:false});await expect(game.locator('#rep-count')).toHaveText(String(i));
  if(i===1){await game.locator('#calibrate').click();await expect(game.locator('#arena-title')).toHaveText('Hold still');await expect(game.locator('#arena-title')).toHaveText('Squat down');await expect(game.locator('.hands-start')).toBeHidden();}
  if(i<5)await page.waitForTimeout(1050);
 }
 await expect(game.locator('#victory')).toBeVisible();expect(await game.locator('body').evaluate(()=>window.startWorker.terminated&&window.startStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
 await pose({hideHands:false});await game.locator('#again').click();await expect(game.locator('.hands-start')).toBeVisible();await expect(game.locator('#rep-count')).toHaveText('0');await game.locator('#stop').click();
});
