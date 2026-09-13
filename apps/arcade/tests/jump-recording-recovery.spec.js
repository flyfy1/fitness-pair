import {test, expect} from '@playwright/test';
import {syntheticCamera} from '../../camera-start/tests/browser/synthetic-camera.js';
import {openReplay} from './open-replay.js';

for (const interruption of ['readyState', 'videoWidth']) {
 test(`portrait Jump Game retains a full replay through a brief camera ${interruption} interruption`, async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  await syntheticCamera(page);
  await page.goto('/play/jump-game');
  const game = page.frameLocator('#game-frame');
  await game.locator('#primary').click();
  await expect(game.locator('#instruction')).toHaveText('Standing pose captured.', {timeout:12000});
  await game.locator('#primary').click();
  await expect(page.locator('#record-panel')).toHaveAttribute('data-state', 'recording');
  // Pause the game to hold the round open without synthetic obstacle avoidance.
  // Its camera and real browser recorder keep running throughout this test.
  await game.locator('#primary').click();
  await page.waitForTimeout(3200);
  await game.locator('#camera').evaluate((video, property) => {
   Object.defineProperty(video, property, {configurable:true, get:()=>0});
   setTimeout(() => { delete video[property]; }, 150);
  }, interruption);
  await page.waitForTimeout(350);
  await expect(page.locator('#record-panel')).toHaveAttribute('data-state', 'recording');
  await page.waitForTimeout(3000);
  await game.locator('#show-settings').click();
  await game.locator('#end-run').click();
  await expect(page.locator('#local-result .clip-card')).toHaveCount(1);
  const video = page.locator('#local-result video'); await openReplay(video);
  const decoded = await video.evaluate(v => ({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));
  expect(decoded.duration).toBeGreaterThan(6);
  expect(decoded.height).toBeGreaterThan(decoded.width);
  // Seek beyond the old cutoff and decode an actual frame, not only metadata.
  await video.evaluate(v => new Promise(resolve => {v.addEventListener('seeked',resolve,{once:true});v.currentTime=5.5;}));
  expect(await video.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await info.attach('decoded-replay', {body:JSON.stringify({evidence:'synthetic-browser',interruption,...decoded}),contentType:'application/json'});
 });
}
