import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';

for(const [name,viewport,language] of [
 ['desktop',{width:1280,height:900},'en'],
 ['phone',{width:390,height:844},'zh'],
 ['landscape',{width:844,height:390},'en'],
]) test(`joined palms with separated wrist estimates: ${name}`,async({page},info)=>{
 await page.setViewportSize(viewport);await camera(page);
 await page.addInitScript(language=>localStorage.setItem('hopmodo.language',language),language);
 await page.goto('/play/ar-breakout');const game=page.frameLocator('#game-frame');
 const pose=value=>game.locator('body').evaluate((_,value)=>Object.assign(window.startPose,value),value);
 // A gesture held through calibration is latched, so tell the player to release.
 await pose({upperOnly:true,hands:'joined-palms'});await game.locator('#start').click();
 await expect(game.locator('.hands-start-status')).toHaveText(language==='zh'?'请先放下并分开双手，再重新尝试。':'Lower and separate your hands first, then try again.');
 await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 await pose({hands:'down',hideHands:true});
 await expect(game.locator('.hands-start-status')).toHaveText(language==='zh'?'保持双手入镜。':'Keep both hands visible.');
 await pose({hideHands:false});
 await expect(game.locator('.hands-start-status')).toHaveText(language==='zh'?'等待开始手势。':'Waiting for your start gesture.');
 const rectangle=await game.locator('.hands-start').evaluate(el=>({height:el.getBoundingClientRect().height,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,viewport:innerHeight,controlsBottom:document.querySelector('.hopmodo-conversation').getBoundingClientRect().bottom}));
 expect(rectangle.height).toBeLessThan(250);expect(rectangle.bottom).toBeLessThan(rectangle.viewport*.8);expect(rectangle.top).toBeGreaterThan(rectangle.controlsBottom);
 await page.screenshot({path:info.outputPath('compact-hands-prompt.png')});
 await pose({hands:'joined-palms'});
 await expect.poll(()=>game.locator('.hands-start progress').evaluate(el=>el.value)).toBeGreaterThan(0);
 await expect(game.locator('.hands-start-title')).toHaveText(language==='zh'?'请将双手靠拢。':'Bring your hands together.');
 await expect(game.locator('.hands-start-status')).toHaveText(language==='zh'?'手势已识别，请分开并放下双手。':'Gesture recognized. Separate and lower your hands.');
 await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 await pose({hands:'down'});await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:12000});
 expect(await game.locator('body').evaluate(()=>({cameras:window.cameraRequests,workers:window.workerCreations}))).toEqual({cameras:1,workers:1});
 await game.locator('#stop').click();
});
