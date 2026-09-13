import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ratingHand } from '../fixtures/rating-hand.js';

test('synthetic 1–5 ratings reach the UI once each and mode changes release the camera', async ({ page }) => {
  await page.addInitScript(() => {
    window.testHand = null;
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
      constructor() { window.testWorker = this; }
      postMessage(data) {
        if (data.type === 'init') { setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0); return; }
        data.bitmap.close();
        const hands = window.testHands ?? (window.testHand ? [structuredClone(window.testHand)] : []);
        setTimeout(() => this.onmessage?.({ data: { type: 'hands', hands, time: data.time, inferenceMs: 1 } }), 0);
      }
      terminate() { this.terminated = true; }
    };
  });
  await page.goto('/'); await page.locator('#mode').selectOption('ratings');
  await expect(page.locator('#rating-catalog article')).toHaveCount(5);
  await page.locator('#start').click();
  for (let n = 1; n <= 5; n++) {
    await page.evaluate(hand => { window.testHand = hand; }, ratingHand(n));
    await expect(page.locator('#rating-value')).toHaveText(String(n));
    await expect(page.locator('#feedback')).toHaveText(`✓ Rate ${n}/5`);
    await expect(page.locator('#rating-count')).toHaveText(`${n} ratings this session`);
    await page.evaluate(() => { window.testHand = null; });
    await expect(page.locator('#cue')).toContainText('hold 1–5 still');
  }
  expect(await page.evaluate(() => window.gestureLab.getState())).toMatchObject({ rating: 5, ratingCount: 5, confirm: 0, no: 0 });
  await page.evaluate(hands => { window.testHands = hands; }, [ratingHand(2, { mirror: true, xOffset: -.22 }), ratingHand(5, { xOffset: .22 })]);
  await expect(page.locator('#Left-rating')).toHaveText('2/5');
  await expect(page.locator('#Right-rating')).toHaveText('5/5');
  await expect(page.locator('#rating-count')).toHaveText('7 ratings this session');
  await expect(page.locator('#gesture-name')).toHaveText('2 hands detected');
  await page.screenshot({ path: 'test-results/ratings-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ratings-mobile.png', fullPage: true });
  await page.locator('#mode').selectOption('controls');
  expect(await page.evaluate(() => window.testWorker.terminated && window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  expect(await page.evaluate(() => window.gestureLab.getState())).toMatchObject({ active: false, rating: null, ratingCount: 0 });
});

for (const twoHands of [false, true]) test(`real model public V-sign fixture rates ${twoHands ? 'both hands' : 'one hand'} independently`, async ({ page, request }) => {
  let bytes;
  try { bytes = await readFile('tests/.cache/victory.jpg'); }
  catch {
    const response = await request.get('https://storage.googleapis.com/mediapipe-assets/victory.jpg', { timeout: 30_000 });
    expect(response.ok()).toBe(true); bytes = await response.body();
    await mkdir('tests/.cache', { recursive: true }); await writeFile('tests/.cache/victory.jpg', bytes);
  }
  await page.addInitScript(({ dataURL, twoHands }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image(); img.src = dataURL; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = twoHands ? img.width * 2 + 80 : img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      const draw = () => {
        ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        if (twoHands) { ctx.save(); ctx.translate(canvas.width, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore(); }
      };
      draw();
      const stream = canvas.captureStream(15); window.testStream = stream;
      const timer = setInterval(() => {
        if (stream.getTracks().every(t => t.readyState === 'ended')) clearInterval(timer);
        else draw();
      }, 66);
      return stream;
    };
  }, { dataURL: `data:image/jpeg;base64,${bytes.toString('base64')}`, twoHands });
  const external = [], errors = [];
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:5183') && !r.url().startsWith('data:')) external.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#mode').selectOption('ratings'); await page.locator('#start').click();
  await expect(page.locator('#rating-value')).toHaveText('2', { timeout: 15_000 });
  await expect(page.locator('#feedback')).toHaveText('✓ Rate 2/5');
  if (twoHands) {
    await expect(page.locator('#Left-rating')).toHaveText('2/5');
    await expect(page.locator('#Right-rating')).toHaveText('2/5');
    await expect(page.locator('#rating-count')).toHaveText('2 ratings this session');
  }
  await page.screenshot({ path: `test-results/ratings-public-${twoHands ? 'dual' : 'single'}.png`, fullPage: true });
  await page.locator('#stop').click();
  expect(await page.evaluate(() => window.testStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await expect.poll(() => page.workers().length).toBe(0);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});
