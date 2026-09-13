import {startWithHands} from './start-hands.js';
import {test, expect} from '@playwright/test';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {syntheticCamera} from './synthetic-camera.js';

test('cancelling pending permission releases a late camera stream', async ({page}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      window.allowLateCamera = () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        window.lateStream = canvas.captureStream(0); resolve(window.lateStream);
      };
    });
  });
  await page.goto('/?game=knife'); await page.locator('#start').click(); await page.locator('#stop').click();
  await page.evaluate(() => window.allowLateCamera());
  await expect.poll(() => page.evaluate(() => window.lateStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await expect(page.locator('#start')).toBeVisible();
});
test('backgrounding a live session stops tracks and the model worker', async ({page}) => {
  await syntheticCamera(page); await page.goto('/?game=knife'); await page.locator('#start').click();
  await startWithHands(page); await expect.poll(() => page.evaluate(() => window.integAR.getState().phase)).toBe('playing');
  await page.evaluate(() => {Object.defineProperty(document, 'hidden', {configurable: true, value: true}); document.dispatchEvent(new Event('visibilitychange'));});
  expect(await page.evaluate(() => window.testStream.getTracks().every(t => t.readyState === 'ended') && window.testWorker.terminated)).toBe(true);
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'idle');
});
test('real local model draws named body joints from a public fixture without external frame requests', async ({page, request}, info) => {
  test.setTimeout(50000);
  let bytes;
  try { bytes = await readFile('tests/.cache/pose.jpg'); }
  catch {
    const response = await request.get('https://storage.googleapis.com/mediapipe-assets/pose.jpg');
    expect(response.ok()).toBe(true); bytes = await response.body();
    await mkdir('tests/.cache', {recursive: true}); await writeFile('tests/.cache/pose.jpg', bytes);
  }
  const dataURL = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  await page.addInitScript(async dataURL => {
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image(); image.src = dataURL; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const stream = canvas.captureStream(15); window.publicFixtureStream = stream;
      const timer = setInterval(() => {
        if (stream.getTracks().every(track => track.readyState === 'ended')) clearInterval(timer);
        else ctx.drawImage(image, 0, 0);
      }, 66);
      return stream;
    };
  }, dataURL);
  const external = []; page.on('request', request => { if (new URL(request.url()).origin !== 'http://127.0.0.1:5285' && !request.url().startsWith('data:')) external.push(request.url()); });
  await page.goto('/?game=breakout'); await page.locator('#start').click();
  await expect.poll(() => page.evaluate(() => !!window.integAR.getState().action), {timeout: 35000}).toBe(true);
  await expect.poll(() => page.locator('#skeleton').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((v,i) => i % 4 === 3 && v > 0))).toBe(true);
  await page.screenshot({path: info.outputPath('public-fixture-body.png')});
  await page.locator('#stop').click();
  expect(await page.evaluate(() => window.publicFixtureStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await expect.poll(() => page.workers().length).toBe(0);
  expect(external).toEqual([]);
});
