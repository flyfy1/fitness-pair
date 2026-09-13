import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

test('preview game: a held action attacks, five hits win, restart clears state', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Move your body');
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Try a gameplay preview' }).click();
  await expect(page.locator('#mode-label')).toContainText('simulated movement');
  await expect(page.locator('#arena-title')).toHaveText('Hold to charge');
  expect(await page.locator('#arena-title').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(96);
  const action = page.locator('#demo-action');
  for (let i = 1; i <= 5; i++) {
    await action.focus(); await page.keyboard.down('Space');
    await expect(page.locator('#charge-value')).toHaveText('100%');
    await expect(page.locator('#arena-title')).toHaveText('Release to attack');
    await page.keyboard.up('Space'); await expect(page.locator('#rep-count')).toHaveText(String(i));
    await expect(page.locator('#arena-title')).toHaveText(i < 5 ? `Hit! ${i} / 5` : 'Quest complete!');
  }
  await expect(page.locator('#victory')).toBeVisible();
  await expect(page.locator('#damage-count')).toHaveText('100');
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('#rep-count')).toHaveText('0'); await expect(page.locator('#victory')).toBeHidden();
  expect(errors).toEqual([]);
});

test('narrow layout and pointer control fit without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Try a gameplay preview' }).click();
  const action = page.locator('#demo-action'); await action.scrollIntoViewIfNeeded();
  const headline = await page.locator('#arena-title').boundingBox();
  expect(Math.abs(headline.x + headline.width / 2 - 195)).toBeLessThan(2);
  expect(await page.locator('#arena-title').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(44);
  const box = await action.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await expect(page.locator('#charge-value')).toHaveText('100%'); await page.mouse.up();
  await expect(page.locator('#rep-count')).toHaveText('1');
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('denied camera permission has a useful error and preview still works', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };
  });
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#status-title')).toHaveText('Camera permission denied');
  await expect(page.locator('#arena-title')).toHaveText('Camera blocked');
  await expect(page.locator('#start')).toBeEnabled();
  await page.locator('#demo').click(); await expect(page.locator('#demo-action')).toBeVisible();
});

test('real local model infers a public pose image, with no camera upload; stop releases tracks', async ({ page, request }) => {
  // Public MediaPipe test image, never a user's private camera recording.
  let bytes;
  try { bytes = await readFile('tests/.cache/pose.jpg'); }
  catch {
    const response = await request.get('https://storage.googleapis.com/mediapipe-assets/pose.jpg', { timeout: 30_000 });
    expect(response.ok()).toBe(true); bytes = await response.body();
    await mkdir('tests/.cache', { recursive: true }); await writeFile('tests/.cache/pose.jpg', bytes);
  }
  const dataURL = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  await page.addInitScript(({ dataURL }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image(); image.src = dataURL; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const stream = canvas.captureStream(15); window.testStream = stream;
      const timer = setInterval(() => {
        if (stream.getTracks().every(track => track.readyState === 'ended')) clearInterval(timer);
        else ctx.drawImage(image, 0, 0);
      }, 66);
      return stream;
    };
  }, { dataURL });
  const external = [], errors = [];
  page.on('request', req => { if (!req.url().startsWith(`http://127.0.0.1:${process.env.MOTION_PORT || 5179}/`) && !req.url().startsWith('data:')) external.push(req.url()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()); });
  await page.goto('/'); await page.locator('#start').click();
  await expect.poll(async () => {
    const error = await page.locator('.tracking-panel.error').count();
    if (error) throw new Error(await page.locator('#status-title').textContent());
    return page.locator('#fps').textContent();
  }, { timeout: 35_000 }).toContain('ms / frame');
  await expect(page.locator('#tracking-badge')).toHaveText(/Body landmarks detected|Calibrating/);
  await expect(page.locator('#rep-count')).toHaveText('0');
  await assertARLayers(page);
  await page.screenshot({ path: 'test-results/real-model.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await assertARLayers(page);
  await page.screenshot({ path: 'test-results/real-model-mobile.png', fullPage: true });
  await page.locator('#stop').click(); await expect(page.locator('#camera-tag')).toHaveText('CAM 01 · OFF');
  expect(await page.evaluate(() => window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await expect.poll(() => page.workers().length).toBe(0);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('cancelling a pending permission request stops the stream if it arrives later', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      window.resolveCamera = () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        window.testStream = canvas.captureStream(0); resolve(window.testStream);
      };
    });
  });
  await page.goto('/'); await page.locator('#start').click();
  await page.locator('#stop').click(); await page.evaluate(() => window.resolveCamera());
  await expect.poll(() => page.evaluate(() => window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await expect(page.locator('#camera-tag')).toHaveText('CAM 01 · OFF');
  expect(page.workers().length).toBe(0);
});

test('synthetic landmark sequence runs through actual detector and wins; completion frees resources', async ({ page }) => {
  // This is deliberately synthetic: model inference is tested independently above.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d'); ctx.fillRect(0, 0, 640, 480);
      const stream = canvas.captureStream(30); window.testStream = stream;
      const timer = setInterval(() => {
        if (stream.getTracks().every(t => t.readyState === 'ended')) clearInterval(timer);
        else ctx.fillRect(0, 0, 640, 480);
      }, 33);
      return stream;
    };
    window.Worker = class {
      constructor() { this.frame = 0; window.testWorker = this; }
      postMessage(data) {
        if (data.type === 'init') { setTimeout(() => this.onmessage({ data: { type: 'ready' } }), 0); return; }
        data.bitmap.close();
        const frame = this.frame++; const down = frame >= 30 && (frame - 30) % 24 < 12;
        const points = Array.from({ length: 33 }, () => ({ x: .5, y: .3, visibility: 1 }));
        for (const ids of [[11,23,25,27], [12,24,26,28]]) {
          points[ids[0]].y = down ? .28 : .2;
          points[ids[1]].y = down ? .53 : .45;
          points[ids[2]].y = .65; points[ids[2]].x = down ? .68 : .5;
          points[ids[3]].y = .9;
        }
        setTimeout(() => { if (!this.terminated) this.onmessage({ data: { type: 'pose', landmarks: window.testMissing ? [] : points, time: data.time, inferenceMs: 1 } }); }, 0);
      }
      terminate() { this.terminated = true; }
    };
  });
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#arena-title')).toHaveText('Hold still');
  await page.evaluate(() => { window.testMissing = true; });
  await expect(page.locator('#arena-title')).toHaveText('Step into view');
  await page.evaluate(() => { window.testMissing = false; });
  await expect(page.locator('#arena-title')).toHaveText('Stand to attack', { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/large-action-cue.png' });
  await expect(page.locator('#rep-count')).toHaveText('5', { timeout: 25_000 });
  await expect(page.locator('#victory')).toBeVisible();
  expect(await page.evaluate(() => window.testWorker.terminated && window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await expect(page.locator('#hp-label')).toHaveText('0 / 100');
});

async function assertARLayers(page) {
  const bounds = await page.evaluate(() => {
    const video = document.querySelector('#camera'), game = document.querySelector('#game');
    const rect = element => { const b = element.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; };
    return { video: rect(video), game: rect(game), skeleton: rect(document.querySelector('#skeleton')),
      viewport: [0, 0, innerWidth, innerHeight], fit: getComputedStyle(video).objectFit,
      mirrored: getComputedStyle(video).transform, live: video.readyState >= 2 && !!video.srcObject,
      // The former opaque forest would hide the camera even with correct DOM geometry.
      cornerAlpha: game.getContext('2d').getImageData(0, 0, 1, 1).data[3],
      overflow: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth };
  });
  expect(bounds.video).toEqual(bounds.viewport);
  expect(bounds.game).toEqual(bounds.viewport);
  expect(bounds.skeleton).toEqual(bounds.viewport);
  expect(bounds.fit).toBe('cover');
  expect(bounds.mirrored).toBe('matrix(-1, 0, 0, 1, 0, 0)');
  expect(bounds.live).toBe(true);
  expect(bounds.cornerAlpha).toBe(0);
  expect(bounds.overflow).toBe(false);
  await expect(page.locator('#camera-placeholder')).toBeHidden();
  await expect(page.locator('#stop')).toBeInViewport();
  await expect(page.locator('#calibrate')).toBeInViewport();
}

test('landscape controls remain reachable over the full camera stage', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto('/');
  await page.locator('#demo').click();
  await expect(page.locator('#demo-action')).toBeInViewport();
  await expect(page.locator('#start')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight === innerHeight)).toBe(true);
  await page.screenshot({ path: 'test-results/landscape.png' });
  for (let i = 1; i <= 5; i++) {
    await page.locator('#demo-action').focus(); await page.keyboard.down('Space');
    await expect(page.locator('#charge-value')).toHaveText('100%');
    await page.keyboard.up('Space'); await expect(page.locator('#rep-count')).toHaveText(String(i));
  }
  await expect(page.locator('#victory')).toBeVisible();
  await expect(page.locator('#again')).toBeInViewport();
  await expect(page.locator('#arena-subtitle')).toHaveText('5 / 5 hits');
  await page.screenshot({ path: 'test-results/landscape-victory.png' });
});
