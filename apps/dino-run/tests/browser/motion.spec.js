import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function syntheticCamera(page) {
  // Synthetic landmarks test integration only, not actual camera recognition accuracy.
  await page.addInitScript(() => {
    window.testRise = 0; window.testMissing = false; window.testDelay = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d'); ctx.fillRect(0, 0, 640, 480);
      const stream = canvas.captureStream(30); window.testStream = stream;
      const timer = setInterval(() => {
        if (stream.getTracks().every(track => track.readyState === 'ended')) clearInterval(timer);
        else ctx.fillRect(0, 0, 640, 480);
      }, 33);
      return stream;
    };
    window.Worker = class {
      constructor() { window.testWorker = this; }
      postMessage(data) {
        if (data.type === 'init') { setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0); return; }
        data.bitmap.close();
        const points = [];
        if (!window.testMissing) {
          for (const [side, x] of [[[11,23,25,27], .44], [[12,24,26,28], .56]]) {
            side.forEach((id, i) => { points[id] = { x, y: [.25,.48,.68,.88][i] - window.testRise, visibility: .99 }; });
          }
        }
        setTimeout(() => { if (!this.terminated) this.onmessage?.({ data: { type: 'pose', landmarks: points, time: data.time } }); }, window.testDelay);
      }
      terminate() { this.terminated = true; }
    };
  });
}
async function calibrate(page) {
  await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.dinoGame.getState().camera.stage)).toBe('maximum');
  expect(await page.evaluate(() => window.dinoGame.getState().status)).toBe('ready');
  await page.evaluate(() => { window.testRise = .14; });
  await page.waitForTimeout(260);
  await page.evaluate(() => { window.testRise = 0; });
  await expect.poll(() => page.evaluate(() => window.dinoGame.getState().camera.calibrated)).toBe(true);
  expect(await page.evaluate(() => window.dinoGame.getState().status)).toBe('ready');
  await expect.poll(() => page.evaluate(() => window.dinoGame.getState().status), {timeout: 6000}).toBe('running');
}

test('synthetic calibration gates play; continuous quarter/half/full height follows the person; loss pauses', async ({ page }) => {
  await syntheticCamera(page);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/'); await page.screenshot({path:'test-results/motion-ready.png',fullPage:true});
  await calibrate(page);
  for (const ratio of [.25, .5, 1, .5, 0]) {
    await page.evaluate(rise => { window.testRise = rise; }, .14 * ratio);
    await expect.poll(async () => Math.abs((await page.evaluate(() => window.dinoGame.getState().height)) - ratio * 165)).toBeLessThan(7);
  }
  await page.keyboard.press('ArrowUp');
  expect(await page.evaluate(() => window.dinoGame.getState().height)).toBe(0);
  await page.screenshot({path:'test-results/motion-live.png',fullPage:true});
  await page.evaluate(() => { window.testDelay = 400; window.testRise = .14; });
  await expect.poll(() => page.evaluate(() => window.dinoGame.getState().status)).toBe('paused');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.dinoGame.getState().height)).toBe(0);
  expect(await page.evaluate(() => window.dinoGame.getState().camera.heightRatio)).toBe(0);
  await page.evaluate(() => { window.testMissing = true; });
  await expect.poll(() => page.evaluate(() => window.dinoGame.getState().status)).toBe('paused');
  const score=await page.evaluate(() => window.dinoGame.getState().score);
  await page.waitForTimeout(850);
  expect(await page.evaluate(() => window.dinoGame.getState().score)).toBe(score);
  expect(await page.evaluate(() => window.dinoGame.getState().camera.calibrated)).toBe(false);
  await page.getByRole('button',{name:'Turn camera off'}).click();
  expect(await page.evaluate(() => window.testWorker.terminated && window.testStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
  expect(errors).toEqual([]);
});

test('delayed camera frames cannot satisfy standing calibration or start a run', async ({page}) => {
  await syntheticCamera(page);await page.goto('/');await page.evaluate(()=>{window.testDelay=400;});
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.dinoGame.getState().camera.state)).toBe('ready');
  await page.waitForTimeout(2100);
  const state=await page.evaluate(()=>window.dinoGame.getState());
  expect(state.status).toBe('ready');expect(state.camera.stage).toBe('standing');expect(state.camera.calibrated).toBe(false);
  await page.getByRole('button',{name:'Turn camera off'}).click();
});

test('mobile calibration layout fits and explicit recalibration freezes a running round', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});await syntheticCamera(page);await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await calibrate(page);
  await page.getByRole('button',{name:'Recalibrate',exact:true}).click();
  expect(await page.evaluate(()=>window.dinoGame.getState().status)).toBe('paused');
  expect(await page.evaluate(()=>window.dinoGame.getState().camera.calibrated)).toBe(false);
  await page.screenshot({path:'test-results/motion-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Turn camera off'}).click();
});

test('permission denial is recoverable; cancellation cleans up a late stream', async ({page}) => {
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});
  await page.goto('/');await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect(page.locator('#calibration-copy')).toContainText('Camera permission denied');
  await page.getByRole('button',{name:'Keyboard mode'}).click();
  await page.getByRole('button',{name:'Let’s run'}).click();
  expect(await page.evaluate(()=>window.dinoGame.getState().status)).toBe('running');
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{
    window.grantCamera=()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;window.testStream=canvas.captureStream(0);resolve(window.testStream);};
  });});
  await page.getByRole('button',{name:'Camera mode'}).click();
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await page.getByRole('button',{name:'Turn camera off'}).click();await page.evaluate(()=>window.grantCamera());
  await expect.poll(()=>page.evaluate(()=>window.testStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
  expect(page.workers().length).toBe(0);
});

test('actual local model produces pose frames from a public image; camera stop releases the worker', async ({page,request}) => {
  // Public static fixture proves model plumbing, not human jumping or calibration accuracy.
  let bytes;
  try { bytes=await readFile('../motion-quest/tests/.cache/pose.jpg'); }
  catch { const response=await request.get('https://storage.googleapis.com/mediapipe-assets/pose.jpg');expect(response.ok()).toBe(true);bytes=await response.body(); }
  await page.addInitScript(dataURL=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const image=new Image();image.src=dataURL;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const stream=canvas.captureStream(30);window.testStream=stream;
      const timer=setInterval(()=>{if(stream.getTracks().every(track=>track.readyState==='ended'))clearInterval(timer);else ctx.drawImage(image,0,0);},33);
      return stream;
    };
  },`data:image/jpeg;base64,${bytes.toString('base64')}`);
  const external=[],errors=[];
  page.on('request',req=>{if(!req.url().startsWith('http://127.0.0.1:5181')&&!req.url().startsWith('data:'))external.push(req.url());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.dinoGame.getState().camera.cue),{timeout:35000}).not.toBe(null);
  expect(await page.evaluate(()=>window.dinoGame.getState().camera.state)).toBe('ready');
  await page.getByRole('button',{name:'Turn camera off'}).click();
  expect(await page.evaluate(()=>window.testStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
  await expect.poll(()=>page.workers().length).toBe(0);
  expect(external).toEqual([]);expect(errors).toEqual([]);
});
