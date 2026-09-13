import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

async function fakeCamera(page) {
  await page.addInitScript(() => {
    window.missing = false;
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const ctx = c.getContext('2d'); ctx.fillRect(0, 0, 640, 480);
      window.stream = c.captureStream(30);
      const timer = setInterval(() => { if (window.stream.getTracks().every(t => t.readyState === 'ended')) clearInterval(timer); else ctx.fillRect(0, 0, 640, 480); }, 33);
      return window.stream;
    };
    window.Worker = class {
      constructor() { window.worker = this; }
      postMessage(data) {
        if (data.type === 'init') { setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0); return; }
        data.bitmap.close(); const points = [];
        if (!window.missing) for (const [ids, x] of [[[11,23,25,27], .44], [[12,24,26,28], .56]]) ids.forEach((id, i) => { points[id] = { x, y: [.2,.45,.65,.9][i], visibility: .99 }; });
        setTimeout(() => { if (!this.terminated && !window.stalled) this.onmessage?.({ data: { type: 'pose', landmarks: points, time: data.time } }); }, 1);
      }
      terminate() { this.terminated = true; }
    };
  });
}
async function demo(page) { await page.goto('/'); await page.getByRole('button', { name: 'Try synthetic demo' }).click(); await expect(page.locator('#test-status')).toHaveText('PASS'); await expect(page.locator('#library')).toBeEnabled(); }
async function exported(page) {
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  return JSON.parse(await readFile(await (await download).path(), 'utf8'));
}
test('synthetic case persists edits, detects failure, exports/imports, scrubs and deletes', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await demo(page); await page.locator('#name').fill('Local regression');
  await page.locator('#expected').fill('3'); await page.getByRole('button', { name: 'Save test case' }).click();
  await expect(page.locator('#test-status')).toHaveText('FAIL');
  const s = await exported(page); expect(s.samples.length).toBe(78); expect(s.test.expectedCount).toBe(3); expect(s.evidence).toBe('synthetic');
  await page.reload(); await page.locator('#library').selectOption(s.id); await expect(page.locator('#test-status')).toHaveText('FAIL');
  await page.locator('#scrub').fill('30'); await page.getByRole('button', { name: 'Set window start' }).click();
  await page.locator('#scrub').fill('53'); await page.getByRole('button', { name: 'Set window end' }).click();
  await page.locator('#expected').fill('1'); await page.getByRole('button', { name: 'Run test', exact: true }).click();
  await expect(page.locator('#test-status')).toHaveText('PASS');
  await page.locator('#expected-phase').selectOption('missing'); await page.getByRole('button', { name: 'Expect current state' }).click();
  await expect(page.locator('#test-status')).toHaveText('FAIL');
  await page.locator('#issue-note').fill('Check landing timing'); await page.getByRole('button', { name: 'Mark this frame' }).click();
  await expect(page.locator('#markers')).toContainText('Check landing timing');
  const edited = await exported(page); expect(edited.test.start).toBe(30); expect(edited.test.end).toBe(53);
  await page.locator('#import').setInputFiles({ name: 'case.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(edited)) });
  await expect(page.locator('#library option')).toHaveCount(3);
  const imported = await exported(page); expect(imported.id).not.toBe(s.id);
  expect(imported.samples).toEqual(edited.samples); expect(imported.test).toEqual(edited.test);
  await page.screenshot({ path: 'test-results/review-desktop.png', fullPage: true });
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Delete session', exact: true }).click();
  await expect(page.locator('#library option')).toHaveCount(2);
  expect(errors).toEqual([]);
});
test('synthetic camera capture keeps missing data, bookmarks, autosaves and stops owned resources', async ({ page }) => {
  await fakeCamera(page); await page.goto('/'); await page.getByRole('button', { name: 'Start capture', exact: true }).click();
  await expect(page.locator('#mode')).toHaveText('RECORDING · LOCAL');
  await expect(page.locator('#cue')).toHaveText('ready', { timeout: 6000 });
  await page.keyboard.press('KeyM'); await expect(page.locator('#notice')).toContainText('Issue marked');
  await page.evaluate(() => { window.missing = true; }); await expect(page.locator('#cue')).toHaveText('missing');
  await expect(page.locator('#storage-status')).toContainText('Saved on this device');
  await page.getByRole('button', { name: 'Stop & review', exact: true }).click();
  await expect(page.locator('#review')).toBeVisible();
  expect(await page.evaluate(() => window.worker.terminated && window.stream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  const s = await exported(page); expect(s.samples.some(s => Object.keys(s.pose.joints).length === 0)).toBe(true);
  expect(s.markers).toHaveLength(1); expect(s.samples[0].pose.source.kind).toBe('camera');
  await page.reload(); await page.locator('#library').selectOption(s.id); await expect(page.locator('#test-status')).toHaveText('UNLABELED');
});
test('permission denial and late permission cancellation are recoverable', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('Permission denied'); }; });
  await page.goto('/'); await page.getByRole('button', { name: 'Start capture', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Permission denied'); await expect(page.locator('#start')).toBeEnabled();
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.grant = () => { window.stream = document.createElement('canvas').captureStream(); resolve(window.stream); }; }); });
  await page.getByRole('button', { name: 'Start capture', exact: true }).click(); await page.getByRole('button', { name: 'Stop & review', exact: true }).click();
  await page.evaluate(() => window.grant());
  await expect.poll(() => page.evaluate(() => window.stream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
});
test('stalled inference stops and preserves captured data', async ({ page }) => {
  await fakeCamera(page); await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#mode')).toHaveText('RECORDING · LOCAL');
  await page.evaluate(() => { window.stalled = true; });
  await expect(page.locator('#notice')).toContainText('stalled');
  await expect(page.locator('#review')).toBeVisible(); expect(await page.evaluate(() => window.worker.terminated)).toBe(true);
});
test('invalid imports preserve the current case', async ({ page }) => {
  await demo(page); const before = await exported(page);
  before.samples[1].pose.tMs = 0;
  await page.locator('#import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(before)) });
  await expect(page.locator('#notice')).toContainText('Import rejected');
  expect((await exported(page)).samples[1].pose.tMs).toBe(160);
});
test('storage failure remains exportable and does not replace unsaved data', async ({ page }) => {
  await page.addInitScript(() => { IDBObjectStore.prototype.put = () => { throw new Error('quota test'); }; });
  await demo(page); await expect(page.locator('#storage-status')).toContainText('Not saved');
  const before = await exported(page);
  await page.locator('#demo').click(); await expect(page.locator('#notice')).toContainText('Local save failed');
  expect((await exported(page)).id).toBe(before.id);
});
for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`AR layout and review fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); await demo(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const video = await page.locator('#camera').boundingBox(), canvas = await page.locator('#skeleton').boundingBox();
    expect(video).toEqual(canvas); expect(video.width).toBe(viewport.width);
    const replayCanvas = await page.locator('#review-skeleton').boundingBox();
    expect(replayCanvas.width / replayCanvas.height).toBeCloseTo(4 / 3, 1);
    await page.screenshot({ path: `test-results/layout-${viewport.width}.png`, fullPage: true });
    await page.locator('#scrub').fill('50'); await expect(page.locator('#position')).toContainText('51 / 78');
  });
}
test('real local model captures a public image without external browser requests', async ({ page, request }) => {
  // Public fixture proves local inference plumbing, not human movement accuracy.
  let bytes;
  try { bytes = await readFile('tests/.cache/pose.jpg'); }
  catch { const r = await request.get('https://storage.googleapis.com/mediapipe-assets/pose.jpg'); expect(r.ok()).toBe(true); bytes = await r.body(); await mkdir('tests/.cache', { recursive: true }); await writeFile('tests/.cache/pose.jpg', bytes); }
  await page.addInitScript(dataURL => {
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image(); image.src = dataURL; await image.decode();
      const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
      const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); window.stream = c.captureStream(30);
      const timer = setInterval(() => { if (window.stream.getTracks().every(t => t.readyState === 'ended')) clearInterval(timer); else ctx.drawImage(image, 0, 0); }, 33);
      return window.stream;
    };
  }, `data:image/jpeg;base64,${bytes.toString('base64')}`);
  const external = [], errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:5277') && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#mode')).toHaveText('RECORDING · LOCAL', { timeout: 35000 });
  await page.locator('#stop').click();
  const s = await exported(page); expect(Object.keys(s.samples[0].pose.joints).length).toBeGreaterThan(0);
  expect(s.samples[0].pose.modelId).toContain('mediapipe');
  await expect.poll(() => page.workers().length).toBe(0);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});
test('unsaved form edits survive creating a second session; replay advances at input time', async ({ page }) => {
  await demo(page); const firstId = await page.locator('#library').inputValue();
  await page.locator('#name').fill('Keep my edits'); await page.locator('#expected').fill('4');
  await page.locator('#demo').click(); await expect(page.locator('#library option')).toHaveCount(3);
  await page.locator('#library').selectOption(firstId);
  await expect(page.locator('#name')).toHaveValue('Keep my edits'); await expect(page.locator('#expected')).toHaveValue('4');
  await expect(page.locator('#test-status')).toHaveText('FAIL');
  await page.locator('#play').click(); await expect.poll(async () => Number(await page.locator('#scrub').inputValue())).toBeGreaterThan(3);
  await page.locator('#play').click(); const value = await page.locator('#scrub').inputValue();
  await page.waitForTimeout(200); expect(await page.locator('#scrub').inputValue()).toBe(value);
});
test('hiding a capture stops camera and retains data for review', async ({ page }) => {
  await fakeCamera(page); await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#mode')).toHaveText('RECORDING · LOCAL');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#review')).toBeVisible();
  expect(await page.evaluate(() => window.worker.terminated && window.stream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
});
test('stop and review exits capture fullscreen so the timeline is accessible', async ({ page }) => {
  await fakeCamera(page); await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#mode')).toHaveText('RECORDING · LOCAL');
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.locator('#stop').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBe(null);
  await expect(page.locator('#review')).toBeVisible();
});
