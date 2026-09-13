import {test,expect} from '@playwright/test';
test('Motion Quest preserves the native full-window game at desktop and mobile sizes',async({page})=>{
 for(const size of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(size);await page.goto('/play/motion-quest');
  const frame=page.frameLocator('#game-frame');await expect(frame.locator('#start')).toBeVisible();
  const box=await page.locator('#game-frame').boundingBox();expect(box.x).toBe(0);expect(box.y).toBe(0);expect(box.width).toBe(size.width);expect(box.height).toBe(size.height);
  const native=await frame.locator('#app').boundingBox();expect(native.width).toBe(size.width);expect(native.height).toBe(size.height);
  await expect(page.locator('.nav, .play-heading, .footer')).toHaveCount(0);
  await expect(frame.locator('#privacy-note')).toContainText('record automatically');
  await expect(frame.getByRole('link',{name:'Back to the Hopmodo arcade'})).toHaveAttribute('target','_top');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
