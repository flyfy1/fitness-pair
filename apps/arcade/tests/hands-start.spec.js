import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';
const games=[...['breakout','invaders','stack','knife','bubble','fruit'].map(id=>({id:'ar-'+id,start:'#start',stop:'#stop'})),{id:'motion-quest',start:'#start',stop:'#stop'},{id:'camera-start',start:'#primary',stop:'#stop'},{id:'plank-flight',start:'#start',stop:'#stop'},{id:'dino-run',start:'#start',stop:'#stop-camera'},{id:'dino-ar',start:'#primary',stop:'#stop'}];
for(const config of games)test(`${config.id}: camera play waits for both hands and release`,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await camera(page);await page.goto('/play/'+config.id);const game=page.frameLocator('#game-frame');
 const pose=value=>game.locator('body').evaluate((_,value)=>Object.assign(window.startPose,value),value);
 if(config.id==='ar-invaders')await game.locator('#tutorial-skip').click();
 if(config.id==='dino-ar'){await game.locator('#control-mode').selectOption('camera');}
 await game.locator(config.start).click();expect(errors).toEqual([]);
 if(config.id==='dino-run'){await page.waitForTimeout(2800);await pose({rise:.1});await page.waitForTimeout(600);await pose({rise:0});}
 await expect(game.locator('.hands-start')).toBeVisible({timeout:12000});
 expect(await game.locator('.hands-start').evaluate(el=>[getComputedStyle(el).backgroundColor,getComputedStyle(el).backgroundImage])).toEqual(['rgba(0, 0, 0, 0)','none']);await expect(game.locator('.hands-start progress')).toHaveCount(0);if(['camera-start','dino-ar'].includes(config.id))await expect(game.locator('#instruction')).toBeHidden();
 await page.waitForTimeout(3500);await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 await pose({hands:'left'});await page.waitForTimeout(1150);await expect(game.locator('.hands-start-title')).toContainText('Raise BOTH');
 await pose({hands:'both'});await expect(game.locator('.hands-start-title')).toContainText('lower both');await page.waitForTimeout(600);await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 await page.screenshot({path:info.outputPath('hands-recognized.png')});await pose({hands:'down'});await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:12000});expect(errors).toEqual([]);
 await game.getByRole('link',{name:'Back to the Hopmodo arcade'}).click();await expect(page).toHaveURL('/#arcade');
});
