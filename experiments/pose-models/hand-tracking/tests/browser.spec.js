import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

async function installCanvasCamera(page, images = []) {
  await page.addInitScript(async ({ images }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 720;
      const ctx = canvas.getContext('2d');
      const loaded = await Promise.all(images.map(async src => { const image = new Image(); image.src = src; await image.decode(); return image; }));
      let index = 0;
      window.showFixture = next => { index = next; };
      const draw = () => {
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const image = loaded[index];
        if (image) {
          const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
          ctx.drawImage(image, (canvas.width - image.width * scale) / 2, (canvas.height - image.height * scale) / 2, image.width * scale, image.height * scale);
        }
      };
      draw();
      const stream = canvas.captureStream(24); window.testStream = stream;
      const timer = setInterval(() => {
        if (stream.getTracks().every(track => track.readyState === 'ended')) clearInterval(timer);
        else draw();
      }, 42);
      return stream;
    };
  }, { images });
}
async function expectReleased(page) {
  await expect.poll(() => page.evaluate(() => window.testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await expect.poll(() => page.workers().length).toBe(0);
  await expect(page.locator('#count')).toHaveText('0 / 2');
}

test('public fixtures: real local inference finds 21/42 points, clears absent hands and releases resources', async ({ page, request }) => {
  // Public MediaPipe test assets, replayed through a canvas camera substitute.
  // This proves inference integration; it is not a live human movement trial.
  const images = [];
  for (const name of ['thumb_up.jpg', 'right_hands.jpg']) {
    let bytes;
    try { bytes = await readFile(`data/${name}`); }
    catch {
      const response = await request.get(`https://storage.googleapis.com/mediapipe-assets/${name}`, { timeout: 30_000 });
      expect(response.ok()).toBe(true); bytes = await response.body();
      await mkdir('data', { recursive: true }); await writeFile(`data/${name}`, bytes);
    }
    images.push(`data:image/jpeg;base64,${bytes.toString('base64')}`);
  }
  await installCanvasCamera(page, images);
  const external = [], errors = [];
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:5182') && !req.url().startsWith('data:')) external.push(req.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  expect(page.workers().length).toBe(0);
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.locator('#count')).toHaveText('1 / 2', { timeout: 35_000 });
  await expect(page.locator('#hands')).toContainText('21 landmarks');
  await expect(page.locator('#timing')).toHaveText(/\d+ ms/);
  const painted = () => page.locator('#overlay').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  });
  expect(await painted()).toBe(true);
  await page.screenshot({ path: 'test-results/one-hand.png', fullPage: true });
  await page.evaluate(() => window.showFixture(1));
  await expect(page.locator('#count')).toHaveText('2 / 2');
  await expect(page.locator('#hands li')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/two-hands.png', fullPage: true });
  await page.evaluate(() => window.showFixture(-1));
  await expect(page.locator('#status')).toHaveText('No hands detected');
  await expect(page.locator('#hands li')).toHaveCount(0);
  expect(await painted()).toBe(false);
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await expectReleased(page);
  await page.locator('#start').click();
  await expect(page.locator('#status')).toHaveText('Hands detected', { timeout: 35_000 });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expectReleased(page);
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('permission denial and narrow layout remain usable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };
  });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#start').click();
  await expect(page.locator('#status')).toHaveText('Camera permission denied');
  await expect(page.locator('#start')).toBeEnabled();
  expect(page.workers().length).toBe(0);
  await page.screenshot({ path: 'test-results/mobile-permission.png', fullPage: true });
});

test('cancel pending permission: a late stream is stopped', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      window.resolveCamera = () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        window.testStream = canvas.captureStream(0); resolve(window.testStream);
      };
    });
  });
  await page.goto('/'); await page.locator('#start').click(); await page.locator('#stop').click();
  await page.evaluate(() => window.resolveCamera()); await expectReleased(page);
  await expect(page.locator('#status')).toHaveText('Camera off');
});

for (const scenario of ['initialization timeout', 'inference timeout', 'worker failure', 'hide', 'cancel initialization']) {
  test(`synthetic lifecycle: ${scenario} frees camera and worker`, async ({ page }) => {
    await installCanvasCamera(page);
    await page.addInitScript(({ scenario }) => {
      window.Worker = class {
        constructor() { window.testWorker = this; }
        postMessage(data) {
          if (data.type === 'frame') { data.bitmap.close(); return; }
          if (scenario === 'worker failure') setTimeout(() => this.onerror(new Error('test failure')), 0);
          else if (!['initialization timeout', 'cancel initialization'].includes(scenario)) {
            setTimeout(() => this.onmessage({ data: { type: 'ready' } }), 0);
          }
        }
        terminate() { this.terminated = true; }
      };
    }, { scenario });
    await page.clock.install();
    await page.goto('/'); await page.locator('#start').click();
    await expect.poll(() => page.evaluate(() => Boolean(window.testWorker))).toBe(true);
    if (scenario === 'initialization timeout') await page.clock.fastForward(31_000);
    if (scenario === 'inference timeout') { await expect(page.locator('#status')).toHaveText('Looking for hands'); await page.clock.fastForward(9_000); }
    if (scenario === 'hide') {
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    }
    if (scenario === 'cancel initialization') await page.locator('#stop').click();
    await expectReleased(page);
    expect(await page.evaluate(() => window.testWorker.terminated)).toBe(true);
    await expect(page.locator('#start')).toBeEnabled();
    if (scenario.includes('timeout')) await expect(page.locator('#hint')).toContainText(/timed out|stalled/);
  });
}
