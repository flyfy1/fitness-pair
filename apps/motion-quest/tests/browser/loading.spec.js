import { test, expect } from '@playwright/test';

// Synthetic camera + controllable model readiness: no participant footage.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 480;
      canvas.getContext('2d').fillRect(0, 0, 640, 480);
      window.testStream = canvas.captureStream(24);
      return window.testStream;
    };
    window.Worker = class {
      constructor() { window.testWorker = this; }
      postMessage(data) { data.bitmap?.close(); }
      terminate() { this.terminated = true; }
    };
  });
  await page.goto('/');
  await page.clock.install();
  await page.locator('#start').click();
  await expect(page.locator('#status-title')).toHaveText('Loading movement tracking');
});

test('slow first model load survives 30 seconds and can become ready', async ({ page }) => {
  await page.clock.fastForward(45_000);
  await expect(page.locator('#status-title')).toHaveText('Still loading movement tracking');
  await expect(page.locator('#stop')).toBeVisible();
  expect(await page.evaluate(() => window.testStream.active)).toBe(true);
  await page.evaluate(() => window.testWorker.onmessage({ data: { type: 'ready' } }));
  await expect(page.locator('#status-title')).toHaveText('Stand tall to calibrate');
  await page.locator('#stop').click();
  expect(await page.evaluate(() => window.testWorker.terminated && !window.testStream.active)).toBe(true);
});

test('model initialization is bounded and releases camera and worker', async ({ page }) => {
  await page.clock.fastForward(120_001);
  await expect(page.locator('#status-title')).toHaveText('Tracking took too long to load');
  await expect(page.locator('#start')).toBeEnabled();
  expect(await page.evaluate(() => window.testWorker.terminated && !window.testStream.active)).toBe(true);
  await page.locator('#demo').click();
  await expect(page.locator('#demo-action')).toBeVisible();
});

test('cancel during loading rejects late readiness and clears pending timers', async ({ page }) => {
  await page.locator('#stop').click();
  await page.evaluate(() => window.testWorker.onmessage({ data: { type: 'ready' } }));
  await page.clock.fastForward(120_001);
  await expect(page.locator('#status-title')).toHaveText('Camera is off');
  expect(await page.evaluate(() => window.testWorker.terminated && !window.testStream.active)).toBe(true);
});
