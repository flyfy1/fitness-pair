import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function syntheticCamera(page) {
  await page.addInitScript(() => {
    window.poseTest = { rise: 0, hand: 'down', missing: false, wristsMissing: false, delay: 0, crouch: false, noiseFrames: 0 };
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const ctx = c.getContext('2d'); const stream = c.captureStream(30); window.testStream = stream;
      const timer = setInterval(() => {
        if (stream.getTracks().every(t => t.readyState === 'ended')) return clearInterval(timer);
        const g = ctx.createLinearGradient(0,0,640,480);g.addColorStop(0,'#597568');g.addColorStop(1,'#9cae94');ctx.fillStyle=g;ctx.fillRect(0,0,640,480);
        // Labeled synthetic torso silhouette for layout review, not a participant image.
        ctx.fillStyle='#d6d7be';ctx.beginPath();ctx.arc(320,82,30,0,Math.PI*2);ctx.fill();ctx.fillRect(270,125,100,120);
      }, 33);
      return stream;
    };
    window.Worker = class {
      constructor() { window.testWorker = this; }
      postMessage(data) {
        if (data.type === 'init') { setTimeout(() => this.onmessage?.({data:{type:'ready'}}),0);return; }
        data.bitmap.close(); const points=[]; const s=window.poseTest;
        if (!s.missing) {
          for (const [indices,x] of [[[11,23],.44],[[12,24],.56]]) indices.forEach((id,i)=>{points[id]={x,y:[.28,.52][i]-s.rise,visibility:.99};});
          if (s.crouch) {
            for (const i of [11,12]) { points[i].y += .19; points[i].x += .08; }
            for (const i of [23,24]) points[i].y += .10;
          }
          if (s.noiseFrames > 0) {
            const kind = s.noiseFrames-- % 3;
            if (kind === 0) points[23].visibility = .2;
            else if (kind === 1) points[11].y -= .16;
            else points.length = 0;
          }
          if (!s.wristsMissing) {
            points[15]={x:.43,y:(s.hand==='up'?.12:.59)-s.rise,visibility:.99};
            points[16]={x:.57,y:.59-s.rise,visibility:.99};
          }
        }
        setTimeout(()=>{if(!this.terminated)this.onmessage?.({data:{type:'pose',landmarks:points,time:data.time}});},s.delay);
      }
      terminate() { this.terminated=true; }
    };
  });
}
async function standingSetup(page) {
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();

  await expect(page.locator('#instruction')).toHaveText('Raise ONE hand.');
}

test('camera fills the window and distant instructions remain large on desktop, portrait and landscape', async ({page})=>{
  await page.goto('/');
  for (const size of [{width:1440,height:960},{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(size);
    const video=await page.locator('#camera').boundingBox();expect(video.width).toBe(size.width);expect(video.height).toBe(size.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('#instruction').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(size.width===1440?96:46);
    await expect(page.getByRole('button',{name:'Enable camera',exact:true})).toBeInViewport();
    await page.screenshot({path:`test-results/ready-${size.width}.png`});
  }
});

test('standing, slider range, one-hand confirmation and countdown finish without requiring wrists to reappear', async ({page})=>{
  await syntheticCamera(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await standingSetup(page);await page.screenshot({path:'test-results/height-captured.png'});
  await page.evaluate(()=>{window.poseTest.hand='up';});
  await expect.poll(()=>page.evaluate(()=>window.cameraSetup.getState().heightConfirmed)).toBe(true);
  await page.evaluate(()=>{window.poseTest.wristsMissing=true;});
  await expect(page.locator('#status')).toHaveText('RANGE CONFIRMED · GET READY');
  await expect(page.locator('#instruction')).toHaveText('Try a small jump.',{timeout:6000});
  expect(await page.evaluate(()=>window.testStream.getTracks().some(t=>t.readyState==='live'))).toBe(true);
  await page.getByRole('button',{name:'Finish test',exact:true}).click();
  expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  const events=await page.evaluate(()=>window.cameraSetup.getLog());
  expect(events.some(e=>e.event==='height-confirmed'&&e.via==='gesture')).toBe(true);
  expect(events.some(e=>e.event==='countdown-started')).toBe(true);expect(events.some(e=>e.event==='setup-completed')).toBe(true);
  expect(errors).toEqual([]);await page.screenshot({path:'test-results/setup-complete.png'});
});

test('countdown interruption exposes a readable reason and writes it to persistent downloadable logs',async({page})=>{
  await syntheticCamera(page);await page.goto('/');await standingSetup(page);
  await page.getByRole('button',{name:'Confirm & continue',exact:true}).click();
  await expect(page.locator('#status')).toHaveText('RANGE CONFIRMED · GET READY');
  await page.evaluate(()=>{window.poseTest.delay=400;});
  await expect(page.locator('#instruction')).toHaveText('Tracking paused.');
  const events=await page.evaluate(()=>window.cameraSetup.getLog());
  expect(events.some(e=>e.event==='countdown-interrupted'&&e.reason==='stale-tracking')).toBe(true);
  await page.getByRole('button',{name:'Stop camera',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:'Log',exact:true}).click();
  await expect(page.locator('#log-entries')).toContainText('countdown-interrupted');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download log',exact:true}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('camera-start-log.json');
  const json=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(json.format).toBe('camera-start-diagnostics/1');expect(json.events.some(e=>e.event==='height-confirmed')).toBe(true);
  expect(JSON.stringify(json)).not.toMatch(/landmarks|data:image|"joints"|"image"/);
  await page.getByRole('button',{name:'Clear log',exact:true}).click();await expect(page.locator('#log-entries')).toHaveText('');
});

test('mobile confirmation is visible, missing torso blocks setup and stop cleans resources', async({page})=>{
  await page.setViewportSize({width:390,height:844});await syntheticCamera(page);await page.goto('/');await standingSetup(page);
  await expect(page.getByRole('button',{name:'Confirm & continue',exact:true})).toBeInViewport();
  await page.screenshot({path:'test-results/mobile-confirm.png'});
  await page.evaluate(()=>{window.poseTest.missing=true;});await expect(page.locator('#instruction')).toHaveText('Step into view.');
  expect(await page.evaluate(()=>window.cameraSetup.getState().heightConfirmed)).toBe(false);
  await page.getByRole('button',{name:'Stop camera',exact:true}).click();
  expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});

test('permission error is actionable and recorded; native fullscreen can be exited',async({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});
  await page.goto('/');await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('setup');
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect(page.locator('#detail')).toHaveText('Allow camera access, then try again.');
  expect(await page.evaluate(()=>window.cameraSetup.getLog().some(e=>e.event==='camera-error'&&e.name==='NotAllowedError'))).toBe(true);
  await expect(page.getByRole('button',{name:'Retry camera',exact:true})).toBeInViewport();
});


test('crouch, takeoff and crouched landing preserve calibration and explain preparation in the log', async({page})=>{
  await syntheticCamera(page);await page.goto('/');
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect(page.locator('#instruction')).toHaveText('Raise ONE hand.');
  await page.evaluate(()=>{window.poseTest.crouch=true;});await page.waitForTimeout(1200);
  await expect(page.locator('#status')).toHaveText('JUMP PREPARATION');
  expect(await page.evaluate(()=>window.cameraSetup.getState().calibration)).toBe('maximum');
  expect(await page.evaluate(()=>window.cameraSetup.getState().canConfirm)).toBe(false);
  await page.screenshot({path:'test-results/crouch-preparation.png'});
  await page.evaluate(()=>{window.poseTest.crouch=false;});await page.waitForTimeout(300);
  expect(await page.evaluate(()=>window.cameraSetup.getState().canConfirm)).toBe(true);
  await page.evaluate(()=>{window.poseTest.rise=.08;});await page.waitForTimeout(300);
  await page.evaluate(()=>{window.poseTest.rise=0;window.poseTest.crouch=true;});await page.waitForTimeout(1200);
  expect(await page.evaluate(()=>window.cameraSetup.getState().calibration)).toBe('maximum');
  expect(await page.evaluate(()=>window.cameraSetup.getState().canConfirm)).toBe(false);
  await page.evaluate(()=>{window.poseTest.crouch=false;});
  await expect(page.locator('#instruction')).toHaveText('Raise ONE hand.');
  await page.getByRole('button',{name:'Confirm & continue',exact:true}).click();
  await expect(page.locator('#instruction')).toHaveText('Try a small jump.',{timeout:6000});
  const events=await page.evaluate(()=>window.cameraSetup.getLog());
  expect(events.some(e=>e.event==='screen-state'&&e.reason==='prepare-jump')).toBe(true);
  expect(events.some(e=>e.event==='calibration-stage'&&e.from==='maximum'&&e.to==='standing')).toBe(false);
});


test('mixed takeoff noise preserves the jump step and short countdown loss pauses without restarting', async({page})=>{
  await syntheticCamera(page); await page.goto('/');
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect(page.locator('#instruction')).toHaveText('Raise ONE hand.');
  await page.evaluate(()=>{window.poseTest.crouch=true;});
  await expect(page.locator('#status')).toHaveText('JUMP PREPARATION');
  const jumpLogStart = await page.evaluate(()=>window.cameraSetup.getLog().length);
  await page.evaluate(()=>{window.poseTest.crouch=false;window.poseTest.rise=.08;window.poseTest.noiseFrames=4;});
  await expect.poll(()=>page.evaluate(()=>window.poseTest.noiseFrames)).toBe(0);
  await page.waitForTimeout(300);
  await page.evaluate(()=>{window.poseTest.rise=0;});
  await expect(page.locator('#instruction')).toHaveText('Raise ONE hand.');
  const before = (await page.evaluate(()=>window.cameraSetup.getLog())).slice(jumpLogStart);
  expect(before.some(e=>e.event==='tracking-signal'&&e.to==='tracking-grace')).toBe(true);
  expect(before.some(e=>e.event==='screen-state'&&e.stage==='missing')).toBe(false);
  expect(before.some(e=>e.event==='calibration-stage'&&e.from==='maximum'&&e.to==='standing')).toBe(false);
  await page.getByRole('button',{name:'Confirm & continue',exact:true}).click();
  await expect(page.locator('#status')).toHaveText('RANGE CONFIRMED · GET READY');
  await page.waitForTimeout(600);
  await page.evaluate(()=>{window.poseTest.noiseFrames=4;});
  await expect.poll(()=>page.evaluate(()=>window.poseTest.noiseFrames)).toBe(0);
  await expect(page.locator('#instruction')).toHaveText('Try a small jump.',{timeout:6000});
  const after = await page.evaluate(()=>window.cameraSetup.getLog());
  expect(after.filter(e=>e.event==='countdown-started')).toHaveLength(1);
  expect(after.filter(e=>e.event==='countdown-interrupted')).toHaveLength(0);
  expect(after.filter(e=>e.event==='tracking-hold-ended').length).toBeGreaterThanOrEqual(2);
});

test('a single coherent height spike cannot start setup or inflate the live response', async({page})=>{
  await syntheticCamera(page); await page.goto('/');
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect(page.locator('#instruction')).toHaveText('Raise ONE hand.');
  // Apply a single frame inside the worker's next response, without wall-clock
  // sleeps that could accidentally generate several elevated samples.
  await page.evaluate(()=>{
    const worker=window.testWorker, post=worker.postMessage.bind(worker);
    worker.postMessage=data=>{window.poseTest.rise=.12;post(data);window.poseTest.rise=0;worker.postMessage=post;};
  });
  await page.waitForTimeout(700);
  expect(await page.evaluate(()=>window.cameraSetup.getState().heightConfirmed)).toBe(false);
  await expect(page.locator('#instruction')).toHaveText('Raise ONE hand.');
  await page.getByRole('button',{name:'Stop camera',exact:true}).click();
});


test('slider changes live response and confirms without any jump; skeleton clears on loss and toggle', async({page})=>{
  await syntheticCamera(page); await page.goto('/');
  await expect(page.getByLabel('Skeleton debug view',{exact:true})).toBeChecked();
  await standingSetup(page);
  await expect(page.getByRole('slider')).toBeEnabled();
  await page.getByRole('slider').fill('10');
  await expect(page.locator('#range-value')).toHaveText('10%');
  await page.evaluate(()=>{window.poseTest.rise=.02;});
  await expect.poll(()=>page.locator('#movement-meter').evaluate(el=>el.value)).toBeGreaterThan(75);
  await page.getByRole('slider').fill('80');
  await expect.poll(()=>page.locator('#movement-meter').evaluate(el=>el.value)).toBeLessThan(15);
  const hasInk = () => page.locator('#body-overlay').evaluate(c=>c.width>0 && c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0));
  expect(await hasInk()).toBe(true);
  await page.screenshot({path:'test-results/body-and-slider.png'});
  await page.evaluate(()=>{window.poseTest.missing=true;});
  await expect.poll(hasInk).toBe(false);
  await page.evaluate(()=>{window.poseTest.missing=false;window.poseTest.rise=0;});
  await expect.poll(hasInk).toBe(true);
  await page.getByLabel('Skeleton debug view',{exact:true}).uncheck();
  await expect(page.locator('#body-overlay')).toBeHidden();
  await expect(page.locator('#instruction')).toHaveText('Raise ONE hand.');
  await page.getByRole('button',{name:'Confirm & continue',exact:true}).click();
  await expect(page.getByRole('slider')).toBeDisabled();
  await expect(page.locator('#instruction')).toHaveText('Try a small jump.',{timeout:6000});
  const log = await page.evaluate(()=>window.cameraSetup.getLog());
  expect(log.some(e=>e.event==='height-confirmed'&&e.rangeSource==='slider'&&e.torsoPercent===80)).toBe(true);
});


test('stopping after confirmation permits a new slider value for the next camera session', async({page})=>{
  await syntheticCamera(page); await page.goto('/'); await standingSetup(page);
  await page.getByRole('button',{name:'Confirm & continue',exact:true}).click();
  await expect(page.getByRole('slider')).toBeDisabled();
  await page.getByRole('button',{name:'Stop camera',exact:true}).click();
  await page.getByRole('slider').fill('10');
  await expect(page.locator('#range-value')).toHaveText('10%');
  await standingSetup(page);
  await page.evaluate(()=>{window.poseTest.rise=.02;});
  await expect.poll(()=>page.locator('#movement-meter').evaluate(el=>el.value)).toBeGreaterThan(75);
  await page.getByRole('button',{name:'Stop camera',exact:true}).click();
});


async function enterJumpTest(page) {
  await syntheticCamera(page); await page.goto('/'); await standingSetup(page);
  await page.getByRole('button',{name:'Confirm & continue',exact:true}).click();
  await expect(page.locator('#instruction')).toHaveText('Try a small jump.',{timeout:6000});
}

test('jump test shows rise, return and a latched confirmation once per real cycle', async({page})=>{
  await enterJumpTest(page);
  for (const size of [{width:390,height:844},{width:844,height:390},{width:1440,height:960}]) {
    await page.setViewportSize(size);
    await expect(page.getByRole('button',{name:'Finish test',exact:true})).toBeInViewport();
    await expect(page.locator('#jump-results')).toBeInViewport();
  }
  await page.evaluate(()=>{window.poseTest.crouch=true;}); await page.waitForTimeout(650);
  await expect(page.locator('#jump-count')).toHaveText('0');
  await page.evaluate(()=>{window.poseTest.crouch=false;}); await page.waitForTimeout(300);
  for (let count=1;count<=2;count++) {
    await page.evaluate(()=>{window.poseTest.rise=.04;});
    await expect(page.locator('#instruction')).toHaveText('Moving up!');
    await page.waitForTimeout(200);
    await expect(page.locator('#jump-count')).toHaveText(String(count-1));
    await page.evaluate(()=>{window.poseTest.rise=.02;});
    await expect(page.locator('#instruction')).toHaveText('Coming back down.');
    await page.evaluate(()=>{window.poseTest.rise=0;});
    await expect(page.locator('#instruction')).toHaveText('Jump detected!');
    await expect(page.locator('#jump-count')).toHaveText(String(count));
    await page.waitForTimeout(400);
    await expect(page.locator('#instruction')).toHaveText('Jump detected!');
  }
  await page.screenshot({path:'test-results/jump-confirmed.png'});
  const events=await page.evaluate(()=>window.cameraSetup.getLog().filter(e=>e.event==='jump-detected'));
  expect(events).toHaveLength(2); expect(new Set(events.map(e=>e.id)).size).toBe(2);
  await page.getByRole('button',{name:'Finish test',exact:true}).click();
  await expect(page.locator('#instruction')).toHaveText('2 jumps detected.');
  expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});

test('live detection rejects one-frame noise and cancels unobserved landing after sustained loss', async({page})=>{
  await enterJumpTest(page);
  await page.evaluate(()=>{
    const worker=window.testWorker, post=worker.postMessage.bind(worker);
    worker.postMessage=data=>{window.poseTest.rise=.12;post(data);window.poseTest.rise=0;worker.postMessage=post;};
  });
  await page.waitForTimeout(600); await expect(page.locator('#jump-count')).toHaveText('0');
  await page.evaluate(()=>{window.poseTest.rise=.04;});
  await expect(page.locator('#instruction')).toHaveText('Moving up!');
  await page.evaluate(()=>{window.poseTest.missing=true;}); await page.waitForTimeout(1200);
  expect(await page.evaluate(()=>window.cameraSetup.getState().testing)).toBe(false);
  await page.evaluate(()=>{window.poseTest.missing=false;window.poseTest.rise=0;});
  await expect(page.locator('#instruction')).toHaveText('Raise ONE hand.');
  await expect(page.locator('#jump-count')).toHaveText('0');
  expect(await page.evaluate(()=>window.cameraSetup.getLog().some(e=>e.event==='jump-test-paused'))).toBe(true);
  await page.getByRole('button',{name:'Stop camera',exact:true}).click();
});
