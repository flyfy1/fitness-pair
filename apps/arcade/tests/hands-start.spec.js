import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';
const games=[...['breakout','invaders','stack','knife','bubble','fruit'].map(id=>({id:'ar-'+id,start:'#start',stop:'#stop'})),{id:'motion-quest',start:'#start',stop:'#stop'},{id:'jump-game',start:'#primary',stop:'#stop'}];
for(const config of games)test(`${config.id}: camera play waits for its framing-specific gesture and release with one camera and worker`,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await camera(page);await page.goto('/play/'+config.id);const game=page.frameLocator('#game-frame');
 const pose=value=>game.locator('body').evaluate((_,value)=>Object.assign(window.startPose,value),value);
 if(config.id==='ar-invaders')await game.locator('#tutorial-skip').click();
 if(config.id.startsWith('ar-'))await pose({upperOnly:true});
 await game.locator(config.start).click();expect(errors).toEqual([]);
 await expect(game.locator('.hands-start')).toBeVisible({timeout:12000});
 expect(await game.locator('.hands-start').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('linear-gradient');await expect(game.locator('.hands-start progress')).toBeVisible();
 await page.waitForTimeout(3500);await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 await pose({hands:'both'});await page.waitForTimeout(1150);await expect(game.locator('.hands-start-title')).toContainText(config.id==='motion-quest'?'LEFT':'together');await pose({hands:'down'});await page.waitForTimeout(500);
 if(config.id!=='motion-quest'){await pose({hands:'left'});await page.waitForTimeout(1200);await expect(game.locator('.hands-start-title')).toContainText('together');await pose({hands:'down'});await page.waitForTimeout(500);}
 await pose({hands:config.id==='motion-quest'?'left':'together'});await expect(game.locator('.hands-start-title')).toContainText('lower both');await page.waitForTimeout(600);await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 await page.screenshot({path:info.outputPath('hands-recognized.png')});await pose({hands:'down'});await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:12000});expect(errors).toEqual([]);expect(await game.locator('body').evaluate(()=>({cameras:window.cameraRequests,workers:window.workerCreations}))).toEqual({cameras:1,workers:1});
 await game.getByRole('link',{name:'Back to the Hopmodo arcade'}).click();await expect(page).toHaveURL('/#arcade');
});
