import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';
test('camera categories expose all eight upper-body games and preserve full-body and pointer distinctions',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Upper body',exact:true}).click();
 await expect(page.locator('.game-card:visible')).toHaveCount(8);
 await expect(page.locator('.game-card:visible')).not.toContainText(['Motion Quest','Orbit Pop']);
 await page.getByRole('button',{name:'Full body',exact:true}).click();
 await expect(page.locator('.game-card:visible')).toHaveCount(1);await expect(page.locator('.game-card:visible')).toContainText('Motion Quest');
 await page.getByRole('button',{name:'All games',exact:true}).click();await page.locator('#other-games').evaluate(el=>el.open=true);
 await expect(page.locator('.game-card:visible')).toHaveCount(10);
 await page.locator('#site-language').selectOption('zh');await page.getByRole('button',{name:'上半身',exact:true}).click();
 await expect(page.locator('.game-card:visible')).toHaveCount(8);
 await page.locator('.game-art[href="/play/ar-bubble"]').click();
 await expect(page.locator('.guide-framing')).toContainText('髋部和腿');await expect(page.locator('.guide-setup')).toContainText('双手靠拢');
});
for(const viewport of [{width:1440,height:1000},{width:390,height:844}])test(`upper-body entry and start illustration fit ${viewport.width}px without camera at entry`,async({page},info)=>{
 await camera(page);await page.setViewportSize(viewport);await page.goto('/play/ar-stack?lang=zh');const game=page.frameLocator('#game-frame');
 await expect(game.locator('.game-entry-framing')).toContainText('上半身');await expect(game.locator('.game-entry-framing')).toContainText('坐着玩');
 await expect(game.locator('[data-entry-start]')).toContainText('双手靠拢');
 expect(await game.locator('body').evaluate(()=>({cameras:window.cameraRequests,workers:window.workerCreations}))).toEqual({cameras:0,workers:0});
 await game.locator('body').evaluate(()=>{window.startPose.upperOnly=true;});await game.locator('#start').click();
 await expect(game.locator('.hands-start')).toBeVisible();await expect(game.locator('.hands-start-title')).toContainText('双手靠拢');
 await expect(game.locator('.hands-start img')).toHaveJSProperty('naturalWidth',220);
 await page.screenshot({path:info.outputPath('upper-body-start.png')});
 expect(await game.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await game.locator('#stop').click();
});
