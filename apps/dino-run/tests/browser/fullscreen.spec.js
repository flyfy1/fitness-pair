import { test, expect } from '@playwright/test';

test('game fills the window by default with a right camera dashboard, and fullscreen preserves a paused round', async ({page}) => {
  await page.goto('/');
  const area=await page.locator('#play-area').boundingBox();
  const game=await page.locator('.arcade').boundingBox();
  const camera=await page.locator('.camera-preview').boundingBox();
  const dashboard=await page.locator('.dashboard').boundingBox();
  expect(area.width).toBe(1440);expect(area.height).toBe(960);
  expect(game.width).toBeGreaterThan(area.width*.7);
  expect(camera.x).toBeGreaterThan(game.x+game.width);
  expect(dashboard.y).toBeGreaterThan(camera.y+camera.height);
  expect(dashboard.x).toBe(camera.x);
  await page.screenshot({path:'test-results/default-desktop.png'});
  await page.getByRole('button',{name:'Keyboard mode'}).click();
  await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('play-area');
  expect(await page.locator('#game').evaluate(c=>c.getBoundingClientRect().height)).toBeGreaterThan(700);
  await page.getByRole('button',{name:'Let’s run'}).click();await page.keyboard.press('KeyP');
  const frozen=await page.evaluate(()=>window.dinoGame.getState());
  await page.screenshot({path:'test-results/fullscreen-desktop.png'});
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement)).toBe(null);
  expect(await page.evaluate(()=>window.dinoGame.getState())).toEqual(frozen);
});

test('embedded-browser fallback fills mobile viewport, keeps camera controls visible and Escape preserves the default layout', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw new DOMException('Unavailable','NotAllowedError');};});
  await page.goto('/');await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
  await expect(page.locator('#play-area')).toHaveClass(/is-expanded/);
  const bounds=await page.locator('#play-area').boundingBox();expect(bounds.width).toBe(390);expect(bounds.height).toBe(844);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const canvas=await page.locator('#game').boundingBox();expect(canvas.height).toBeGreaterThan(250);expect(canvas.y+canvas.height).toBeLessThanOrEqual(844);
  await expect(page.getByRole('button',{name:'Enable camera',exact:true})).toBeInViewport();
  await page.screenshot({path:'test-results/fullscreen-mobile.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#play-area')).not.toHaveClass(/is-expanded/);
  expect(await page.evaluate(()=>document.body.classList.contains('game-expanded'))).toBe(false);
  expect(await page.evaluate(()=>window.dinoGame.getState().status)).toBe('ready');
  expect((await page.locator('#play-area').boundingBox()).height).toBe(844);
  await page.setViewportSize({width:844,height:390});
  const game=await page.locator('.arcade').boundingBox();
  const camera=await page.locator('.camera-preview').boundingBox();
  expect(camera.x).toBeGreaterThan(game.x+game.width);
  expect(game.width).toBeGreaterThan(844*.65);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Enable camera',exact:true})).toBeInViewport();
  await page.screenshot({path:'test-results/default-landscape.png'});
});
