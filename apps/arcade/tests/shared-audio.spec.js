import {test,expect} from '@playwright/test';
import {syntheticCamera as guidedCamera} from '../../camera-start/tests/browser/synthetic-camera.js';
const energy=video=>video.evaluate(async v=>{const context=new AudioContext();try{const b=await context.decodeAudioData(await(await fetch(v.src)).arrayBuffer());const d=b.getChannelData(0);return Math.sqrt(d.reduce((sum,x)=>sum+x*x,0)/d.length);}finally{await context.close();}});

test('Ready to Move shares the countdown and now retains its game sound in replay',async({page})=>{
 await guidedCamera(page);await page.goto('/play/camera-start');const game=page.frameLocator('#game-frame');
 await game.locator('#primary').click();await expect(game.locator('#instruction')).toHaveText('Raise ONE hand.',{timeout:12000});
 await game.locator('#primary').click();
 for(const [number,cue] of [['3','three'],['2','two'],['1','one']]){
  await expect(game.locator('#instruction')).toHaveText(number);
  await expect.poll(()=>game.locator('body').evaluate(()=>window.cameraSetup.getState().audio.lastCue)).toBe(cue);
 }
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.waitForTimeout(700);await game.locator('#show-settings').click();await game.locator('#end-run').click();
 await expect(page.locator('#local-result video')).toBeVisible();expect(await energy(page.locator('#local-result video'))).toBeGreaterThan(.001);
});
