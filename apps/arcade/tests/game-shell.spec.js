import {test, expect} from '@playwright/test';

const games = [
  {id: 'motion-quest', stage: '#app', start: '#start', note: '#privacy-note'},
  {id: 'dino-run', stage: '#play-area', start: '#start', note: '.camera-note'},
  {id: 'dino-ar', stage: '#arena', start: '#primary', note: '.privacy'},
  {id: 'plank-flight', stage: '.stage', start: '#start', note: '.privacy'},
  {id: 'camera-start', stage: '#setup', start: '#primary', note: '#feedback'},
];

for (const game of games) {
  test(`${game.id} fills the window and keeps game entry, exit and replay tools reachable`, async ({page}, info) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const size of [{width: 1440, height: 1000}, {width: 390, height: 844}, {width: 320, height: 740}]) {
      await page.setViewportSize(size);
      await page.goto(`/play/${game.id}`);
      const frame = page.frameLocator('#game-frame');
      await expect(frame.locator(game.start)).toBeInViewport();
      const box = await page.locator('#game-frame').boundingBox();
      expect(box).toMatchObject({x: 0, y: 0, width: size.width, height: size.height});
      const stage = await frame.locator(game.stage).boundingBox();
      expect(stage).toMatchObject({x: 0, y: 0, width: size.width, height: size.height});
      await expect(page.locator('.nav, .play-heading, .footer')).toHaveCount(0);
      await expect(frame.locator(game.note)).toContainText(/records? automatically|records on this device/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await frame.locator('html').evaluate(el => el.scrollWidth <= innerWidth)).toBe(true);
      const tools = await page.locator('.game-replay-tools').boundingBox();
      expect(tools.y).toBe(size.height);
      await page.screenshot({path: info.outputPath(`${game.id}-${size.width}.png`)});

      const home = frame.getByRole('link', {name: 'Back to the Hopmodo arcade'});
      await expect(home).toBeInViewport();
      await expect(home).toHaveAttribute('target', '_top');
      if (size.width === 1440) await home.click();
      else {
        await home.focus();
        await home.press('Enter');
      }
      await expect(page).toHaveURL('/#arcade');
      await expect(page.locator('#game-frame')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}
