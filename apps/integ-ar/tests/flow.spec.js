import {test, expect} from '@playwright/test';
import {syntheticCamera} from './synthetic-camera.js';
const state = page => page.evaluate(() => window.integAR.getState());
const pose = (page, value) => page.evaluate(value => Object.assign(window.poseTest, value), value);
const countKey = {invaders: 'shotsFired', stack: 'drops', knife: 'throws', bubble: 'shotsFired', 'fruit-merge': 'drops'};
for (const slug of ['breakout', 'invaders', 'stack', 'knife', 'bubble', 'fruit-merge']) {
  test(`${slug}: synthetic camera controls the original game in transparent AR and cleans up`, async ({page}, info) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await syntheticCamera(page); await page.goto('/?game=' + slug);
    if(slug==='invaders')await page.locator('#tutorial-skip').click();
    await page.locator('#start').click();
    await expect.poll(async () => (await state(page)).phase).toBe('playing');
    await page.waitForTimeout(350);
    if (['breakout', 'invaders', 'fruit-merge'].includes(slug)) {
      const key = {breakout: 'paddle', invaders: 'ship', 'fruit-merge': 'held'}[slug];
      const initial = (await state(page)).game[key]; await pose(page, {x: .06});
      await expect.poll(async () => (await state(page)).game[key]).toBeLessThan(initial - 25);
      await pose(page, {x: -.06});
      await expect.poll(async () => (await state(page)).game[key]).toBeGreaterThan(initial + 25);
      await pose(page, {x: 0});
    }
    if (slug === 'bubble') {
      await pose(page, {aimX: .63, aimY: .36});
      await expect.poll(async () => (await state(page)).game.aim.x).toBeLessThan(100);
      await expect.poll(async () => (await state(page)).game.aim.y).toBe(45);
    }
    if (slug === 'stack') {
      // Time a real observed block position; no direct game state mutation.
      await expect.poll(async () => (await state(page)).game.moving.x, {intervals: [15]}).toBeGreaterThan(105);
    }
    if (countKey[slug]) {
      await pose(page, {hand: 'up'});
      await expect.poll(async () => (await state(page)).game[countKey[slug]]).toBe(1);
      await page.waitForTimeout(400);
      expect((await state(page)).game[countKey[slug]]).toBe(1);
      await pose(page, {hand: 'down'});
    }
    await page.locator('#pause').click();
    expect((await state(page)).phase).toBe('paused');
    const frozen = (await state(page)).game;
    await pose(page, {hand: 'up', x: .08}); await page.waitForTimeout(400);
    expect((await state(page)).game).toEqual(frozen);
    await pose(page, {hand: 'down', x: 0}); await page.waitForTimeout(350);
    await page.locator('#pause').click(); await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'playing');
    const alpha = await page.locator('#world').evaluate(c => {
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let painted = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) painted++;
      return painted / (c.width * c.height);
    });
    expect(alpha).toBeGreaterThan(.001); expect(alpha).toBeLessThan(.6);
    const bones = await page.locator('#skeleton').evaluate(c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v,i) => i % 4 === 3 && v > 0));
    expect(bones).toBe(true);
    await page.screenshot({path: info.outputPath(slug + '-desktop.png')});
    await page.setViewportSize({width: 390, height: 844});
    await page.screenshot({path: info.outputPath(slug + '-mobile.png')});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#finish')).toBeInViewport();
    await page.locator('#finish').click();
    await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'complete');
    expect(await page.evaluate(() => window.testStream.getTracks().every(t => t.readyState === 'ended') && window.testWorker.terminated)).toBe(true);
    expect(errors).toEqual([]);
  });
}
test('missing tracking pauses physics, clears old bones and needs deliberate recovery', async ({page}) => {
  await syntheticCamera(page); await page.goto('/?game=invaders'); await page.locator('#tutorial-skip').click(); await page.locator('#start').click();
  await expect.poll(async () => (await state(page)).phase).toBe('playing');
  await pose(page, {missing: true}); await expect.poll(async () => (await state(page)).phase).toBe('paused');
  const frozen = (await state(page)).game;
  await page.waitForTimeout(350); expect((await state(page)).game).toEqual(frozen);
  expect(await page.locator('#skeleton').evaluate(c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.every((v,i) => i % 4 !== 3 || v === 0))).toBe(true);
  await page.locator('#pause').click(); expect((await state(page)).phase).toBe('paused');
  await pose(page, {missing: false, hand: 'up'}); await page.waitForTimeout(300);
  await page.locator('#pause').click(); await page.waitForTimeout(300);
  expect((await state(page)).game.shotsFired).toBe(0);
  await pose(page, {hand: 'down'}); await page.waitForTimeout(400); await pose(page, {hand: 'both'});
  await expect.poll(async () => (await state(page)).phase).toBe('paused');
  expect((await state(page)).game.shotsFired).toBe(0);
  await page.locator('#stop').click(); expect(await page.evaluate(() => window.testWorker.terminated)).toBe(true);
});
test('permission failure exposes a retry without starting a game', async ({page}) => {
  await page.addInitScript(() => {navigator.mediaDevices.getUserMedia = async () => {throw new DOMException('Denied', 'NotAllowedError');};});
  await page.goto('/?game=bubble'); await page.locator('#start').click();
  await expect(page.locator('#camera-error')).toContainText('permission was denied');
  await expect(page.locator('#start')).toBeVisible();
});

test('Fruit Orbit accepts higher-tier fruit from body drops without false overflow at spawn', async ({page}) => {
  await syntheticCamera(page); await page.goto('/?game=fruit-merge'); await page.locator('#start').click();
  await expect.poll(async () => (await state(page)).phase).toBe('playing'); await page.waitForTimeout(350);
  await page.evaluate(() => { window.gameRandom = .5; });
  for (let drop = 1; drop <= 3; drop++) {
    await pose(page, {x: (drop - 2) * .08, hand: 'down'}); await page.waitForTimeout(500);
    await pose(page, {hand: 'up'});
    await expect.poll(async () => (await state(page)).game.drops).toBe(drop);
    if (drop === 1) await page.evaluate(() => { window.gameRandom = .99; });
    await page.waitForTimeout(250);
    expect((await state(page)).phase).toBe('playing');
  }
  const tiers = (await state(page)).game.fruits.map(fruit => fruit.level);
  expect(tiers).toContain(1); expect(tiers).toContain(2);
  await page.locator('#finish').click();
});
