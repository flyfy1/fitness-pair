import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

async function syntheticCamera(page, workerMode = 'sequence') {
  await page.addInitScript(({ workerMode }) => {
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
        if (data.type === 'init') {
          if (workerMode !== 'init-stall') setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0);
          return;
        }
        data.bitmap.close(); if (workerMode === 'stall') return;
        const i = this.frame++;
        const category = i < 35 ? 'Thumb_Up' : 'Open_Palm';
        const hands = i >= 35 && i < 52 ? [] : [{ side: 'Right', category, score: .98,
          joints: { wrist: { x: i < 52 ? .5 : .5 + Math.sin((i - 52) * .35) * .18, y: .7, confidence: null },
            middleMcp: { x: i < 52 ? .5 : .5 + Math.sin((i - 52) * .35) * .18, y: .5, confidence: null } } }];
        const time = data.time;
        setTimeout(() => { if (!this.terminated) this.onmessage?.({ data: { type: 'hands', hands, time, inferenceMs: 1 } }); }, 0);
      }
      terminate() { this.terminated = true; }
    };
  }, { workerMode });
}

test('complete library and English UI fit desktop and mobile', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#catalog article')).toHaveCount(8);
  await expect(page.getByRole('heading', { name: 'Let your hands do the talking.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('synthetic camera observations drive Confirm and No; stop releases resources', async ({ page }) => {
  await syntheticCamera(page); await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#confirm-count')).toHaveText('1');
  await expect(page.locator('#no-count')).toHaveText('1', { timeout: 10_000 });
  await expect(page.locator('#feedback')).toHaveText('✕ No');
  await expect(page.locator('#confirm-count')).toHaveText('1');
  await page.locator('#stop').click();
  expect(await page.evaluate(() => window.testWorker.terminated && window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
});

test('permission denial is recoverable; a late cancelled stream is stopped', async ({ page }) => {
  await page.addInitScript(() => {
    let call = 0;
    navigator.mediaDevices.getUserMedia = () => {
      if (!call++) return Promise.reject(new DOMException('denied', 'NotAllowedError'));
      return new Promise(resolve => { window.resolveCamera = () => {
        const canvas = document.createElement('canvas'); window.testStream = canvas.captureStream(0); resolve(window.testStream);
      }; });
    };
  });
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#status')).toHaveText('Camera permission denied');
  await page.locator('#start').click(); await page.locator('#stop').click();
  await page.evaluate(() => window.resolveCamera());
  await expect.poll(() => page.evaluate(() => window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  expect(page.workers().length).toBe(0);
});

test('stalled inference stops the camera and worker', async ({ page }) => {
  await syntheticCamera(page, 'stall'); await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#detail')).toContainText('stalled', { timeout: 5000 });
  expect(await page.evaluate(() => window.testWorker.terminated && window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
});

test('initialization is bounded and page exit cancels a pending model', async ({ page }) => {
  await syntheticCamera(page, 'init-stall'); await page.goto('/'); await page.clock.install();
  await page.locator('#start').click();
  await expect(page.locator('#status')).toHaveText('Loading the local gesture model');
  await page.clock.fastForward(31_000);
  await expect(page.locator('#detail')).toContainText('timed out');
  expect(await page.evaluate(() => window.testWorker.terminated && window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await page.locator('#start').click();
  await expect(page.locator('#status')).toHaveText('Loading the local gesture model');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(await page.evaluate(() => window.testWorker.terminated && window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
});

test('real local model recognizes a public thumbs-up fixture and confirms without external requests', async ({ page, request }) => {
  // Official public test image; this is fixture inference, not a human camera trial.
  let bytes;
  try { bytes = await readFile('tests/.cache/thumb_up.jpg'); }
  catch {
    const response = await request.get('https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg', { timeout: 30_000 });
    expect(response.ok()).toBe(true); bytes = await response.body();
    await mkdir('tests/.cache', { recursive: true }); await writeFile('tests/.cache/thumb_up.jpg', bytes);
  }
  await page.addInitScript(({ dataURL }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image(); img.src = dataURL; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const stream = canvas.captureStream(15); window.testStream = stream;
      const timer = setInterval(() => {
        if (stream.getTracks().every(t => t.readyState === 'ended')) clearInterval(timer);
        else ctx.drawImage(img, 0, 0);
      }, 66);
      return stream;
    };
  }, { dataURL: `data:image/jpeg;base64,${bytes.toString('base64')}` });
  const external = [], errors = [];
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:5183') && !r.url().startsWith('data:')) external.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#confidence')).toContainText('Thumb Up', { timeout: 15_000 });
  await expect(page.locator('#gesture-name')).toHaveText('Thumbs up');
  await expect(page.locator('#confirm-count')).toHaveText('1');
  await expect(page.locator('#feedback')).toHaveText('✓ Confirm');
  await page.screenshot({ path: 'test-results/public-fixture.png', fullPage: true });
  await page.locator('#stop').click();
  await expect.poll(() => page.workers().length).toBe(0);
  expect(await page.evaluate(() => window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});
