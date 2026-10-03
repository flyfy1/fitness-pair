import {test, expect} from '@playwright/test';
import {syntheticCamera} from './synthetic-camera.js';
import {startWithHands} from './start-hands.js';

const state = page => page.evaluate(() => window.integAR.getState());
const pose = (page, value) => page.evaluate(value => Object.assign(window.poseTest, value), value);
async function start(page, slug = 'knife') {
  await syntheticCamera(page); await page.goto('/?game=' + slug);
  if (slug === 'invaders') await page.locator('#tutorial-skip').click();
  await page.locator('#start').click(); await startWithHands(page);
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(() => {
    window.originalWorker = window.testWorker; window.originalStream = window.testStream;
    window.phases = []; window.gameplay.subscribe(() => window.phases.push(window.gameplay.getFrame().phase));
  });
}
const countKey = {invaders: 'shotsFired', stack: 'drops', knife: 'throws', bubble: 'shotsFired', 'fruit-merge': 'drops'};
for (const slug of ['breakout', 'invaders', 'stack', 'knife', 'bubble', 'fruit-merge']) {
  test(`${slug}: brief gaps continue; sustained loss freezes and recovers the same round without ghost actions`, async ({page}) => {
    test.setTimeout(45000);
    await start(page, slug); const original = await state(page);
    await pose(page, {missing: true, x: .08}); await page.waitForTimeout(700);
    expect((await state(page)).phase).toBe('playing');
    await expect(page.locator('#cue')).toContainText('Holding your last position');
    if (slug === 'breakout') expect((await state(page)).game.serveRemainingMs).toBeLessThan(original.game.serveRemainingMs - 400);
    if (slug === 'knife') expect((await state(page)).game.rotation).not.toBe(original.game.rotation);
    const position = {breakout: 'paddle', invaders: 'ship', 'fruit-merge': 'held'}[slug];
    if (position) expect((await state(page)).game[position]).toBe(original.game[position]);
    await pose(page, {missing: false, hand: 'up', x: 0}); await page.waitForTimeout(450);
    expect((await state(page)).phase).toBe('playing');
    await expect(page.locator('#cue')).not.toContainText('Holding your last position');
    expect(await page.evaluate(() => window.phases)).toEqual([]);
    if (countKey[slug]) expect((await state(page)).game[countKey[slug]]).toBe(0);

    await pose(page, {missing: true});
    await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'paused');
    expect((await state(page)).pauseReason).toBe('tracking');
    const frozen = (await state(page)).game;
    await pose(page, {missing: false, hand: 'up'}); await page.waitForTimeout(2200);
    expect((await state(page)).game).toEqual(frozen);
    await expect(page.locator('#cue')).toContainText('below your shoulders');
    await pose(page, {hand: 'down'});
    await expect(page.locator('#cue')).toContainText('Continuing in');
    expect((await state(page)).game).toEqual(frozen);
    // Losing observations in the countdown restarts readiness without unfreezing physics.
    await pose(page, {missing: true}); await page.waitForTimeout(400);
    await expect(page.locator('#cue')).toContainText('Return to view');
    expect((await state(page)).game).toEqual(frozen);
    await pose(page, {missing: false});
    await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'playing');
    const resumed = await state(page);
    expect(resumed.round).toBe(original.round);
    expect(resumed.action.sessionId).toBe(original.action.sessionId);
    expect(await page.evaluate(() => window.testWorker === window.originalWorker && window.testStream === window.originalStream)).toBe(true);
    if (countKey[slug]) {
      expect(resumed.game[countKey[slug]]).toBe(0);
      await page.waitForTimeout(400);
      if (slug === 'stack') await expect.poll(async () => (await state(page)).game.moving.x, {intervals: [15]}).toBeGreaterThan(105);
      await pose(page, {hand: 'up'});
      await expect.poll(async () => (await state(page)).game[countKey[slug]]).toBe(1);
    }
    await page.locator('#finish').click();
    expect(await page.evaluate(() => window.testWorker.terminated && window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  });
}

test('manual pause and Stay paused preserve player control over resuming', async ({page}) => {
  await start(page); await page.locator('#pause').click();
  await pose(page, {missing: true}); await page.waitForTimeout(400); await pose(page, {missing: false});
  await page.waitForTimeout(2300); expect((await state(page)).phase).toBe('paused');
  expect((await state(page)).pauseReason).toBe('manual');
  await page.locator('#pause').click(); await pose(page, {missing: true});
  await expect(page.locator('#pause')).toHaveText('Stay paused');
  await pose(page, {missing: false}); await expect(page.locator('#cue')).toContainText('Continuing in');
  await page.locator('#pause').click(); await expect(page.locator('#pause')).toHaveText('Resume');
  await page.waitForTimeout(2300); expect((await state(page)).phase).toBe('paused');
  await page.locator('#pause').click(); await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'playing');
});

for (const [control, phase] of [['finish', 'complete'], ['stop', 'idle'], ['recalibrate', 'setup'], ['background', 'idle']]) {
  test(`${control} cancels pending tracking recovery`, async ({page}) => {
    await start(page); await pose(page, {missing: true});
    await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'paused');
    await pose(page, {missing: false}); await expect(page.locator('#cue')).toContainText('Continuing in');
    if (control === 'background') await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, value: true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    else await page.locator('#' + control).click();
    await page.waitForTimeout(2300);
    expect((await state(page)).phase).toBe(phase);
    expect((await state(page)).recovery.status).toBe('inactive');
    if (control !== 'recalibrate') expect(await page.evaluate(() => window.testWorker.terminated && window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  });
}

test('delayed model results cannot extend grace or advance recovery', async ({page}) => {
  await start(page); await pose(page, {delay: 400});
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'paused');
  const frozen = (await state(page)).game; await page.waitForTimeout(2300);
  expect((await state(page)).game).toEqual(frozen);
  expect((await state(page)).recovery.status).toBe('tracking');
  await pose(page, {delay: 0}); await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'playing');
  expect((await state(page)).game.throws).toBe(0);
});
