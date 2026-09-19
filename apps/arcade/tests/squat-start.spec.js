import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';
test('Motion Quest calibrates once, confirms with left hand, completes five squats and retries',async({page},info)=>{
 await camera(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 const pose=value=>game.locator('body').evaluate((_,v)=>Object.assign(window.startPose,v),value);
 await pose({hideHands:true});await game.locator('#start').click();
 await expect(game.locator('.hands-start')).toBeHidden();
 await expect(game.locator('#arena-title')).toHaveText('Hold still');
 await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 await expect(game.locator('.hands-start')).toBeVisible();await pose({hideHands:false,hands:'down'});await page.waitForTimeout(500);await pose({hands:'left'});await expect(game.locator('.hands-start-title')).toContainText('lower both');await pose({hands:'down'});
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:10000});
 await expect(game.locator('#arena-title')).toHaveText('Squat down');
 await page.screenshot({path:info.outputPath('direct-squat-start.png')});
 for(let i=1;i<=5;i++){
  await pose({squat:true});await expect(game.locator('#charge-value')).toHaveText('100%');await page.waitForTimeout(350);
  await expect(game.locator('#rep-count')).toHaveText(String(i-1));await pose({squat:false});await expect(game.locator('#rep-count')).toHaveText(String(i));
  if(i===1){await game.locator('#calibrate').click();await expect(game.locator('#arena-title')).toHaveText('Hold still');await expect(game.locator('#arena-title')).toHaveText('Squat down');await expect(game.locator('.hands-start')).toBeHidden();}
  if(i<5)await page.waitForTimeout(1050);
 }
 await expect(game.locator('#victory')).toBeVisible();expect(await game.locator('body').evaluate(()=>window.startWorker.terminated&&window.startStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
 await page.getByRole('dialog').getByRole('button',{name:'View replay',exact:true}).click();await game.locator('#again').click();await expect(game.locator('#arena-title')).toHaveText('Hold still');await expect(game.locator('.hands-start')).toBeHidden();await expect(game.locator('#rep-count')).toHaveText('0');await game.locator('#stop').click();
});

test('Push-up Flight takes off with head and one shoulder, without hands',async({page})=>{
 await camera(page);await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
 await game.locator('body').evaluate(()=>Object.assign(window.startPose,{hideHands:true,hideRightShoulder:true}));
 await game.locator('#start').click();await expect(game.locator('.hands-start')).toHaveCount(0);
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:12000});
 await game.locator('#stop').click();
 expect(await game.locator('body').evaluate(()=>window.startWorker.terminated&&window.startStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});
