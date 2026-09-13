import {startWithHands} from '../../integ-ar/tests/start-hands.js';
import {test,expect} from '@playwright/test';
import {syntheticCamera} from '../../integ-ar/tests/synthetic-camera.js';
const move=(frame,value)=>frame.locator('#arena').evaluate((el,value)=>Object.assign(window.poseTest,value),value);
const step=(frame,value)=>expect(frame.locator('#tutorial')).toHaveAttribute('data-step',value);
test('tutorial stays out of local recording and completed practice enters the original AR round',async({page},info)=>{
 await syntheticCamera(page);const uploads=[],errors=[];page.on('request',r=>{if(r.method()==='PUT')uploads.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/play/ar-invaders');const game=page.frameLocator('#game-frame');await game.locator('#tutorial-start').click();await step(game,'left');
 expect(await game.locator('#tutorial-detail').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
 await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');await expect(game.getByRole('button',{name:'Record conversation',exact:true})).toBeHidden();
 const initial=await game.locator('#arena').evaluate(()=>window.integAR.getState().game);
 await move(game,{x:.08});await step(game,'right');await move(game,{x:-.08});await step(game,'fire');
 await page.setViewportSize({width:390,height:844});await expect(game.locator('#tutorial-skip')).toBeInViewport();await page.screenshot({path:info.outputPath('tutorial-host-mobile.png')});
 expect(await game.locator('#skeleton').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0))).toBe(true);
 await move(game,{x:0,hand:'up'});await step(game,'lower');await move(game,{hand:'down'});await step(game,'ready');
 await expect(page.locator('#local-result video')).toHaveCount(0);expect(await game.locator('#arena').evaluate(()=>window.integAR.getState().game)).toEqual(initial);
 await startWithHands(game);await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');await expect(game.locator('#tutorial')).toBeHidden();
 await page.waitForTimeout(400);await move(game,{hand:'up'});await expect.poll(()=>game.locator('#arena').evaluate(()=>window.integAR.getState().game.shotsFired)).toBe(1);
 await game.locator('#finish').click();await expect(page.locator('#local-result video')).toBeVisible({timeout:12000});expect(uploads).toEqual([]);expect(errors).toEqual([]);
});
test('intro keeps practice, skip and exit accessible at narrow and landscape sizes',async({page},info)=>{
 for(const size of [{width:320,height:740},{width:844,height:390},{width:1440,height:1000}]){
  await page.setViewportSize(size);await page.goto('/play/ar-invaders');const game=page.frameLocator('#game-frame');await expect(game.locator('#tutorial-start')).toBeInViewport();await expect(game.locator('#tutorial-skip')).toBeInViewport();await expect(game.locator('#home')).toBeInViewport();
  expect(await game.locator('#arena').evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`tutorial-intro-${size.width}.png`)});
 }
});
