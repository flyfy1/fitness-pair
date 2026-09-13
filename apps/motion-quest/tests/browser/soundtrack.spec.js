import { test, expect } from '@playwright/test';

async function observeAudio(page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) { super(...args); window.testAudioContext = this; }
      createMediaStreamDestination() {
        const destination = super.createMediaStreamDestination();
        const analyser = this.createAnalyser(); analyser.fftSize = 2048;
        this.createMediaStreamSource(destination.stream).connect(analyser);
        window.testRecordingAnalyser = analyser;
        return destination;
      }
    };
  });
}
const level = page => page.evaluate(() => {
  const analyser = window.testRecordingAnalyser; if (!analyser) return 0;
  const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data);
  return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
});

test('recording audio has a backing beat, charge and impact; mute and stop silence it', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const voices = new Set(); page.on('response', response => {
    if (response.url().includes('/audio/') && response.ok()) voices.add(response.url());
  });
  await observeAudio(page); await page.goto('/');
  const sound = page.getByRole('button', { name: 'Game sound', exact: true });
  await sound.click(); await sound.click(); // Unlock audio while still on setup.
  await expect.poll(() => voices.size).toBe(4);
  expect(await level(page)).toBe(0);
  await page.locator('#demo').click();
  await expect.poll(() => level(page)).toBeGreaterThan(.003);
  await page.locator('#demo-action').focus(); await page.keyboard.down('Space');
  await expect(page.locator('#charge-value')).toHaveText('100%');
  await expect.poll(() => level(page)).toBeGreaterThan(.01);
  await page.keyboard.up('Space');
  await expect(page.locator('#game')).toHaveAttribute('data-effect-phase', 'impact');
  await expect.poll(() => level(page)).toBeGreaterThan(.003);
  await sound.click();
  await expect.poll(() => level(page)).toBeLessThan(.0001);
  await sound.click();
  await expect.poll(() => level(page)).toBeGreaterThan(.003);
  await page.locator('#start').click(); // Leaving preview cancels its sound before camera setup.
  await page.locator('#stop').click();
  await expect.poll(() => level(page)).toBeLessThan(.0001);
  await page.waitForTimeout(1200);
  expect(await level(page)).toBeLessThan(.0001);
  expect(errors).toEqual([]);
});

test('late voice downloads cannot revive a cancelled round', async ({ page }) => {
  await observeAudio(page);
  await page.route('**/audio/*.wav', async route => {
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 1800));
    await route.fulfill({ response });
  });
  await page.goto('/'); await page.locator('#demo').click();
  await page.locator('#start').click();
  await page.locator('#stop').click();
  await page.waitForTimeout(2400);
  expect(await level(page)).toBeLessThan(.0001);
});
