import {openReplay} from './open-replay.js';
import {startWithHands} from '../../integ-ar/tests/start-hands.js';
import {test,expect} from '@playwright/test';
import {syntheticCamera} from '../../integ-ar/tests/synthetic-camera.js';
import {arGames} from '../../integ-ar/src/catalog.js';
for(const config of arGames)test(`${config.id}: guest plays AR and receives a local camera replay`,async({page},info)=>{
 await syntheticCamera(page);const errors=[],uploads=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['PUT','POST'].includes(r.method()))uploads.push(r.url());});
 await page.goto('/play/'+config.id);const game=page.frameLocator('#game-frame');
 await expect(game.locator('#game-title')).toHaveText(config.title);
 await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
 if(config.slug==='invaders')await game.locator('#tutorial-skip').click();
 await game.locator('#start').click();await startWithHands(game);await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#record-status')).toContainText('game + camera');
 await page.waitForTimeout(900);await game.locator('#pause').click();
 await page.setViewportSize({width:config.slug==='bubble'?320:390,height:844});
 const microphone=game.getByRole('button',{name:'Record conversation',exact:true});await expect(microphone).toBeInViewport();
 const micBox=await microphone.boundingBox(),tracking=await game.locator('.movement-hud').boundingBox();expect(micBox.y).toBeGreaterThanOrEqual(tracking.y+tracking.height);
 await expect(game.locator('#finish')).toBeInViewport();
 const cue=await game.locator('#cue').boundingBox(),buttons=await game.locator('.controls').boundingBox();expect(cue.y+cue.height).toBeLessThanOrEqual(buttons.y);
 await page.screenshot({path:info.outputPath('host-mobile.png')});
 await game.locator('#finish').click();await expect(page.locator('#local-result video')).toBeVisible({timeout:12000});
 await expect(page.locator('#local-result')).toContainText(config.title);
 await openReplay(page.locator('#local-result video'));
 const decoded=await page.locator('#local-result video').evaluate(async v=>{
  v.pause();await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=.4;});
  const c=document.createElement('canvas');c.width=1280;c.height=800;const x=c.getContext('2d');x.drawImage(v,0,0,c.width,c.height);
  const d=x.getImageData(0,0,1280,720).data;let camera=0,bones=0;
  for(let i=0;i<d.length;i+=4){const [r,g,b]=d.slice(i,i+3);if(r>60&&r<180&&g>r&&g>b&&b>50)camera++;if(r>65&&r<180&&g>220&&b>175)bones++;}
  return {camera,bones};
 });
 expect(decoded.camera).toBeGreaterThan(50000);expect(decoded.bones).toBeGreaterThan(150);
 expect(await game.locator('#arena').evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
 expect(uploads).toEqual([]);expect(errors).toEqual([]);
 if(config.slug==='knife'){
  await game.locator('#start').click();await startWithHands(game);await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
  await page.waitForTimeout(400);await game.locator('#finish').click();await expect(page.locator('#local-result video')).toHaveCount(2,{timeout:12000});
 }
 await game.locator('#home').click();await expect(page).toHaveURL('/#arcade');
});
