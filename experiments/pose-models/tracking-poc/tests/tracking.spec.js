import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

async function fixtureCamera(page, request, name, crop = 1) {
  let bytes;
  try { bytes = await readFile(`.cache/${name}`); } catch {
    const response = await request.get(`https://storage.googleapis.com/mediapipe-assets/${name}`, { timeout: 30_000 });
    expect(response.ok()).toBe(true); bytes = await response.body();
    await mkdir('.cache', { recursive: true }); await writeFile(`.cache/${name}`, bytes);
  }
  // Public fixture replay injected at the camera boundary; this is not a human camera trial.
  await page.addInitScript(({ dataURL, crop }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image(); image.src = dataURL; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = Math.round(image.height * crop);
      const ctx = canvas.getContext('2d');
      const draw = () => { ctx.fillStyle = 'black'; ctx.fillRect(0,0,canvas.width,canvas.height); if (!window.blankFixture) ctx.drawImage(image,0,0); };
      draw(); const stream = canvas.captureStream(15); window.testStreams ??= []; window.testStreams.push(stream);
      const timer = setInterval(() => { if (stream.getTracks().every(t => t.readyState === 'ended')) clearInterval(timer); else draw(); }, 66);
      return stream;
    };
  }, { dataURL: `data:image/jpeg;base64,${bytes.toString('base64')}`, crop });
}
async function released(page) {
  expect(await page.evaluate(() => window.testStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
  await expect.poll(() => page.workers().length).toBe(0);
  await expect(page.locator('#points')).toHaveText('—');
}

test('desktop and narrow mode controls fit; camera permission failure can be retried', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied','NotAllowedError'); }; });
  await page.goto('/'); await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.locator('#start').click(); await expect(page.locator('#status')).toHaveText('Camera permission denied');
  await expect(page.locator('#start')).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Upper body' }).click();
  await expect(page.locator('#guide')).toContainText('Legs can stay outside');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

for (const scenario of [
  { mode: 'hands', image: 'right_hands.jpg', crop: 1, points: '42 / 42' },
  { mode: 'full', image: 'pose.jpg', crop: 1, points: '12 / 12' },
  { mode: 'upper', image: 'pose.jpg', crop: .58, points: '6 / 6' },
]) test(`real model on public fixture: ${scenario.mode}`, async ({ page, request }) => {
  await fixtureCamera(page, request, scenario.image, scenario.crop);
  const external = [], errors = [];
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:5186') && !req.url().startsWith('data:')) external.push(req.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.locator(`[data-mode="${scenario.mode}"]`).click(); await page.locator('#start').click();
  await expect(page.locator('#points')).toHaveText(scenario.points, { timeout: 35_000 });
  await expect(page.locator('#timing')).toContainText('ms');
  const observation = { mode: scenario.mode, input: scenario.image, crop: scenario.crop, points: await page.locator('#points').textContent(), inference: await page.locator('#timing').textContent() };
  console.info('PUBLIC FIXTURE', JSON.stringify(observation));
  await page.screenshot({ path: `test-results/${scenario.mode}-public-fixture.png`, fullPage: true });
  await page.evaluate(() => { window.blankFixture = true; });
  await expect(page.locator('#points')).toHaveText(scenario.mode === 'hands' ? '0 / 21' : `0 / ${scenario.mode === 'upper' ? 6 : 12}`, { timeout: 10_000 });
  await expect(page.locator('#status')).toContainText(scenario.mode === 'hands' ? 'No hands' : 'No body');
  await page.locator('#stop').click(); await released(page);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('switching modes releases the old session; restart and page exit release new resources', async ({ page, request }) => {
  await fixtureCamera(page, request, 'right_hands.jpg');
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#points')).toHaveText('42 / 42', { timeout: 35_000 });
  await page.locator('[data-mode="upper"]').click(); await released(page);
  await page.locator('#start').click(); await expect(page.locator('#timing')).toContainText('ms', { timeout: 35_000 });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await released(page);
});

test('a late permission grant after mode switch is immediately stopped', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      window.grantCamera = () => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
        const stream = canvas.captureStream(0); window.testStreams = [stream]; resolve(stream);
      };
    });
  });
  await page.goto('/'); await page.locator('#start').click(); await page.locator('[data-mode="full"]').click();
  await page.evaluate(() => window.grantCamera()); await released(page);
});

test('stalled inference releases camera and worker', async ({ page, request }) => {
  await fixtureCamera(page, request, 'pose.jpg');
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() { window.stalledWorker = this; }
      postMessage(data) { if (data.type === 'init') setTimeout(() => this.onmessage({ data: { type: 'ready' } }),0); else data.bitmap.close(); }
      terminate() { this.terminated = true; }
    };
  });
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#status')).toHaveText('Tracking could not start or continue', { timeout: 12_000 });
  await released(page); expect(await page.evaluate(() => window.stalledWorker.terminated)).toBe(true);
});
