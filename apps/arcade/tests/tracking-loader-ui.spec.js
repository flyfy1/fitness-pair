import { test, expect } from '@playwright/test';

// Synthetic worker messages isolate presentation states; tracking-preload.spec.js
// separately exercises real downloads, cache reuse and cancellation.
async function openLoader(page) {
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() { window.preloadWorker = this; }
      postMessage() {}
      terminate() { this.terminated = true; }
    };
  });
  await page.goto('/');
}
const send = (page, data) => page.evaluate(data => window.preloadWorker.onmessage({ data }), data);

for (const width of [320, 390, 768, 1440]) {
  test(`loader states remain readable and secondary at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLoader(page);
    const loader = page.locator('#tracking-preload');
    const progress = page.getByRole('progressbar', { name: 'Movement controls download' });
    const status = loader.getByRole('status');
    await expect(status).toContainText('Getting movement controls ready');
    await expect(progress).not.toHaveAttribute('value');
    await expect(page.locator('#tracking-bytes')).toHaveText('Checking saved files…');
    await send(page, { type: 'progress', state: 'downloading', loaded: 3_000_000, total: 8_000_000 });
    await expect(progress).toHaveAttribute('value', '3000000');
    await expect(progress).toHaveAttribute('max', '8000000');
    await expect(progress).toHaveAttribute('aria-valuetext', '37% · 3.0 / 8.0 MB');
    await expect(status).toContainText('Downloading movement controls');
    const cta = page.locator('.hero').getByRole('link', { name: 'Take me to the arcade' });
    const ctaBounds = await cta.boundingBox();
    const loaderBounds = await loader.boundingBox();
    expect(loaderBounds.y).toBeGreaterThanOrEqual(ctaBounds.y + ctaBounds.height + 20);
    await page.getByRole('button', { name: 'Cancel download' }).focus();
    await page.screenshot({ path: testInfo.outputPath(`loading-${width}.png`) });
    await page.keyboard.press('Enter');
    await expect(status).toContainText('Download paused');
    expect(await page.evaluate(() => window.preloadWorker.terminated)).toBe(true);
    await page.getByRole('button', { name: 'Retry download' }).click();
    await expect(progress).not.toHaveAttribute('value');
    await expect(progress).not.toHaveAttribute('aria-valuetext');
    await expect(page.locator('#tracking-bytes')).not.toContainText('37%');
    await send(page, { type: 'progress', state: 'downloading', loaded: 3_000_000, total: null });
    await expect(progress).not.toHaveAttribute('value');
    await expect(page.locator('#tracking-bytes')).toHaveText('3.0 MB received');
    await send(page, { type: 'error', name: 'NetworkError' });
    await expect(status).toContainText('Download couldn’t finish');
    await expect(progress).toBeHidden();
    await expect(page.getByRole('button', { name: 'Retry download' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`error-${width}.png`) });
    await page.getByRole('button', { name: 'Retry download' }).click();
    await send(page, { type: 'preloaded', persistent: false });
    await expect(status).toContainText('Movement controls ready');
    await expect(status).toContainText('couldn’t save');
    await page.screenshot({ path: testInfo.outputPath(`unsaved-${width}.png`) });
    await send(page, { type: 'preloaded', persistent: true });
    await expect(status).toContainText('Saved on this device');
    await expect(loader.getByRole('button')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`ready-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await cta.click();
    await expect(page).toHaveURL(/#arcade$/);
    await expect(page.getByRole('heading', { name: 'PICK A GAME. GET MOVING.' })).toBeInViewport();
  });
}
