import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('homepage preloads without camera; real worker reuses persistent bytes across game and visits', async ({ page, context }) => {
  test.setTimeout(120_000);
  const assets = [];
  context.on('request', request => { if (request.url().includes('sha256=')) assets.push(request.url()); });
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.cameraRequests++;
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      canvas.getContext('2d').fillRect(0, 0, 640, 480);
      window.testStream = canvas.captureStream(24); return window.testStream;
    };
  });
  await page.goto('/');
  await expect(page.locator('#tracking-title')).toHaveText('Movement controls ready', { timeout: 60_000 });
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  expect(assets.filter(url => url.includes('.task'))).toHaveLength(1);
  expect(assets).toHaveLength(4);
  await page.screenshot({ path: 'test-results/preload-desktop.png' });
  const count = assets.length;
  // All mounted games use the same bytes, including their direct-entry aliases.
  await page.evaluate(async () => {
    for (const game of ['dino-run', 'dino-ar', 'plank-flight', 'camera-start']) {
      await new Promise((resolve, reject) => {
        const worker = new Worker(`/games/${game}/runtime/pose-worker.js`);
        const timer = setTimeout(() => { worker.terminate(); reject(Error('Worker timeout')); }, 30_000);
        worker.onmessage = ({ data }) => {
          if (data.type === 'ready' || data.type === 'error') {
            clearTimeout(timer); worker.terminate();
            data.type === 'ready' ? resolve() : reject(Error(data.message));
          }
        };
        worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(Error(event.message)); };
        worker.postMessage({ type: 'init', base: new URL(`/games/${game}/`, location.href).href });
      });
    }
  });
  expect(assets).toHaveLength(count);
  await page.goto('/play/motion-quest');
  const game = page.frameLocator('#game-frame');
  await game.locator('#start').click();
  await expect(game.locator('#mode-label')).toHaveText('Camera AR · squat controls', { timeout: 45_000 });
  await expect(game.locator('#fps')).toContainText('ms / frame');
  expect(assets).toHaveLength(count);
  await game.locator('#stop').click();
  await page.goto('/');
  await expect(page.locator('#tracking-title')).toHaveText('Movement controls ready');
  expect(assets).toHaveLength(count);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/preload-mobile.png' });
  // Closing the tab destroys all worker memory; a fresh page must read persistent storage.
  const next = await context.newPage(); await page.close(); await next.goto('/');
  await expect(next.locator('#tracking-title')).toHaveText('Movement controls ready');
  expect(assets).toHaveLength(count);
});

test('storage unavailable still initializes actual model and reports no saved copy', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.route('**/asset-cache.js', async route => {
    const body = await readFile('packages/pose-mediapipe/asset-cache.js', 'utf8');
    await route.fulfill({ contentType: 'text/javascript', body: `Object.defineProperty(self,'caches',{get(){throw Error('Storage denied')}});\n${body}` });
  });
  await page.goto('/');
  await expect(page.locator('#tracking-title')).toHaveText('Movement controls ready', { timeout: 45_000 });
  await expect(page.locator('#tracking-detail')).toContainText('couldn’t save');
  await page.goto('/games/motion-quest/');
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      c.getContext('2d').fillRect(0, 0, 640, 480); return c.captureStream(24);
    };
  });
  await page.locator('#start').click();
  await expect(page.locator('#fps')).toContainText('ms / frame', { timeout: 45_000 });
  await page.locator('#stop').click();
});

test('slow homepage download stays cancellable and retry recovers without blocking preview', async ({ page, context }) => {
  let release; const held = new Promise(resolve => { release = resolve; });
  let hold = true;
  await context.route('**/pose_landmarker_lite.task?*', async route => {
    if (hold) await held;
    await route.continue().catch(() => {});
  });
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#tracking-title')).toHaveText('Downloading movement controls');
  await page.clock.fastForward(25_000);
  await expect(page.locator('#tracking-detail')).toContainText('Slow connections');
  await expect(page.locator('#tracking-bytes')).toContainText('%');
  await page.screenshot({ path: 'test-results/preload-downloading.png' });
  await page.getByRole('button', { name: 'Cancel download' }).click();
  await expect(page.locator('#tracking-title')).toHaveText('Download paused');
  await page.getByRole('button', { name: 'Launch a playground jump' }).click();
  hold = false; release();
  await page.getByRole('button', { name: 'Retry download' }).click();
  await expect(page.locator('#tracking-title')).toHaveText('Movement controls ready', { timeout: 45_000 });
});

test('two simultaneous preload workers coordinate downloads', async ({ page, context }) => {
  const requests = [];
  context.on('request', request => { if (request.url().includes('sha256=')) requests.push(request.url()); });
  await page.goto('/');
  const other = await context.newPage(); await other.goto('/');
  await expect(page.locator('#tracking-title')).toHaveText('Movement controls ready', { timeout: 45_000 });
  await expect(other.locator('#tracking-title')).toHaveText('Movement controls ready');
  expect(requests).toHaveLength(4);
});
