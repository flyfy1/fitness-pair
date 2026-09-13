import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function syntheticCamera(page) {
  await page.addInitScript(() => {
    window.testRise = 0; window.testMissing = false; window.testDelay = 0; window.testUpper = false;
    window.testUnstable = false; window.testWidthNoise = false; window.testFeetStill = false;
    window.testShouldersOnly = false; window.testWeakHips = false;
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const c = canvas.getContext('2d');
      const draw = () => {
        c.fillStyle = '#34473f'; c.fillRect(0,0,640,480);
        c.fillStyle = '#526659'; c.fillRect(0,350,640,130);
        c.fillStyle = '#d9bb92'; c.beginPath(); c.arc(320,82-window.testRise*480,25,0,Math.PI*2); c.fill();
        c.fillStyle = '#a3b9ba'; c.fillRect(282,116-window.testRise*480,76,115);
        c.fillStyle = '#233b43'; c.fillRect(282,231-window.testRise*480,28,190); c.fillRect(330,231-window.testRise*480,28,190);
        c.save(); c.translate(640,0); c.scale(-1,1); c.fillStyle = '#fff'; c.font = '12px sans-serif'; c.fillText('SYNTHETIC CAMERA · NOT A HUMAN TRIAL',20,260); c.restore();
      };
      draw(); const stream = canvas.captureStream(30); window.testStream = stream;
      const timer = setInterval(() => { if (stream.getTracks().every(t=>t.readyState==='ended')) clearInterval(timer); else draw(); },33);
      return stream;
    };
    window.Worker = class {
      constructor() { window.testWorker = this; this.seq = 0; }
      postMessage(data) {
        if (data.type === 'init') { setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0); return; }
        data.bitmap.close(); const points = []; this.seq++;
        if (!window.testMissing) for (const [ids,x] of [[[11,13,15,23,25,27],.44],[[12,14,16,24,26,28],.56]]) {
          ids.forEach((id,i)=>{if(window.testUpper && i>=4 || window.testShouldersOnly && i>=3)return; points[id]={x,y:[.25,.34,.43,.48,.68,.88][i]-window.testRise,visibility:.99};});
        }
        if (!window.testMissing) {
          if (window.testWeakHips) for (const id of [23,24,25,26,27,28]) if (points[id]) {
            points[id].visibility=.1; points[id].y=1.1;
          }
          if (window.testFeetStill) for (const id of [25,26,27,28]) if (points[id]) {
            points[id].y += window.testRise;
            if (id < 27) points[id].x += id === 25 ? .08 : -.08;
          }
          if (window.testWidthNoise && this.seq % 2) {
            points[11].x += .016; points[24].x -= .014;
          }
          if (window.testUnstable && this.seq % 2) for (const point of points) if (point) point.y += .025;
        }
        setTimeout(()=>{if(!this.terminated)this.onmessage?.({data:{type:'pose',landmarks:points,time:data.time}});},window.testDelay);
      }
      terminate() { this.terminated = true; }
    };
  });
}
const state = page => page.evaluate(()=>window.dinoAR.getState());
async function enterPlay(page, button = 'Enable camera') {
  await page.getByRole('button',{name:button,exact:true}).click();
  await expect.poll(async()=>(await state(page)).status,{timeout:6000,intervals:[30]}).toBe('running');
  expect((await state(page)).camera.calibrated).toBe(true);
  expect(await page.evaluate(()=>window.testRise)).toBe(0);
  expect((await state(page)).height).toBe(0);
  expect((await state(page)).jumps).toBe(0);
}
async function expectStopped(page) {
  expect(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  expect(await page.evaluate(()=>window.testWorker?.terminated ?? true)).toBe(true);
}

test('AR camera loop: anchored player, optional skeleton, proportional height, clear, collision and retry', async({page})=>{
  await syntheticCamera(page); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await page.screenshot({path:'test-results/ar-ready.png'});
  await expect(page.locator('#skeleton')).toBeHidden();
  await enterPlay(page); expect((await state(page)).anchored).toBe(true);
  const video = await page.locator('#camera').boundingBox(); expect(video).toMatchObject({x:0,y:0,width:1440,height:960});
  await page.getByLabel('Debug · show body skeleton').check(); await expect(page.locator('#skeleton')).toBeVisible();
  for (const ratio of [.5,1,.25,0]) {
    await page.evaluate(r=>{window.testRise=r*.115;},ratio);
    await expect.poll(async()=>Math.abs((await state(page)).height-ratio*165)).toBeLessThan(8);
  }
  await expect.poll(async()=>(await state(page)).camera.bestHeightRatio).toBeGreaterThan(.95);
  await expect(page.locator('#best-height')).not.toHaveText('BEST LIFT 0%');
  await page.getByLabel('Debug · show body skeleton').uncheck();
  await expect(page.locator('#skeleton')).toBeHidden(); expect((await state(page)).camera.state).toBe('ready');
  const headline = await page.locator('#instruction').boundingBox();
  expect(headline.y + headline.height).toBeLessThan(960*.27);
  await page.screenshot({path:'test-results/ar-live.png'});
  await expect.poll(async()=>{const d=(await state(page)).nextObstacleDistance;return d!==null&&d<80&&d>5;},{timeout:12000,intervals:[30]}).toBe(true);
  await expect(page.locator('#cue')).toHaveText('Jump!');
  await page.evaluate(()=>{window.testRise=.14;}); await page.waitForTimeout(700); await page.evaluate(()=>{window.testRise=0;});
  await expect.poll(async()=>(await state(page)).passed).toBeGreaterThan(0);
  await expect.poll(async()=>(await state(page)).status,{timeout:10000}).toBe('over');
  await expectStopped(page);
  await expect(page.locator('#best-height')).not.toHaveText('BEST LIFT 0%');
  await enterPlay(page,'Play again'); expect((await state(page)).passed).toBe(0);
  await page.getByRole('button',{name:'Turn camera off'}).click(); await expectStopped(page);
  expect(errors).toEqual([]);
});

test('mobile upper-body view, fullscreen, debug toggling and manual pause clean up',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await syntheticCamera(page); await page.goto('/');
  await page.evaluate(()=>{window.testUpper=true;}); await enterPlay(page);
  expect((await state(page)).camera.trackingMode).toBe('shoulders');
  await page.getByLabel('Debug · show body skeleton').check();
  await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
  expect((await state(page)).status).toBe('running');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const headline=await page.locator('#instruction').boundingBox();
  expect(headline.y).toBeLessThan(844*.25); expect(headline.x+headline.width/2).toBeCloseTo(195,0);
  expect(await page.locator('#cue').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(48);
  await page.screenshot({path:'test-results/ar-mobile.png'});
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  await page.getByRole('button',{name:'Pause',exact:true}).click(); await expectStopped(page);
  expect((await state(page)).status).toBe('paused');
});

test('stale/missing tracking freezes the round and requires explicit resume; recalibration removes anchor',async({page})=>{
  await syntheticCamera(page); await page.goto('/'); await enterPlay(page);
  await page.evaluate(()=>{window.testDelay=400;window.testRise=.14;});
  await expect.poll(async()=>(await state(page)).status).toBe('paused');
  const score=(await state(page)).score; await page.waitForTimeout(500); expect((await state(page)).score).toBe(score);
  expect((await state(page)).height).toBe(0);
  await page.evaluate(()=>{window.testDelay=0;window.testRise=0;});
  // A >750 ms loss rebuilds the resting reference without another entry jump.
  await expect.poll(async()=>(await state(page)).camera.stage).toBe('ready');
  await expect(page.getByRole('button',{name:'Resume run',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Resume run',exact:true}).click();
  await expect.poll(async()=>(await state(page)).status,{timeout:6000}).toBe('running');
  await page.getByRole('button',{name:'Reset position',exact:true}).click();
  expect((await state(page)).anchored).toBe(false); expect((await state(page)).status).toBe('paused');
  await page.evaluate(()=>{window.testMissing=true;}); await page.waitForTimeout(900);
  expect((await state(page)).camera.calibrated).toBe(false);
  await page.getByRole('button',{name:'Turn camera off'}).click(); await expectStopped(page);
});

test('portrait full-body runway stays clear of HUD controls and missing tracking clears debug bones',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await syntheticCamera(page); await page.goto('/');
  await enterPlay(page); await page.getByLabel('Debug · show body skeleton').check();
  await expect(page.locator('#arena')).toHaveClass(/floor-lane/);
  const controls=await page.locator('footer').boundingBox();
  expect(controls.y+controls.height).toBeLessThan(844*.8);
  await page.screenshot({path:'test-results/ar-mobile-fullbody.png'});
  await page.evaluate(()=>{window.testMissing=true;});
  await expect.poll(async()=>(await state(page)).status).toBe('paused');
  await expect.poll(()=>page.locator('#skeleton').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(v=>v!==0))).toBe(false);
  await page.getByRole('button',{name:'Turn camera off'}).click(); await expectStopped(page);
});

test('stable shoulders enter play directly despite bent knees, stuck feet and lateral joint noise',async({page})=>{
  await syntheticCamera(page); await page.goto('/');
  await page.evaluate(()=>{window.testUnstable=true;window.testFeetStill=true;window.testWidthNoise=true;});
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect.poll(async()=>(await state(page)).camera.state).toBe('ready');
  await page.waitForTimeout(450);
  await expect(page.getByRole('heading',{name:'Stand comfortably for a moment.',exact:true})).toBeVisible();
  expect((await state(page)).camera.stage).toBe('standing');
  await page.getByLabel('Debug · show body skeleton').check();
  await expect(page.locator('#tracking-detail')).toContainText('Stage: standing');
  await page.evaluate(()=>{window.testUnstable=false;});
  expect(await page.evaluate(()=>window.testRise)).toBe(0);
  await expect.poll(async()=>(await state(page)).status,{timeout:2000,intervals:[30]}).toBe('running');
  expect((await state(page)).anchored).toBe(true);
  await page.getByRole('button',{name:'Turn camera off'}).click(); await expectStopped(page);
});

test('shoulders alone start the real game with missing or unreliable waist landmarks and a visible chest marker',async({page})=>{
  await syntheticCamera(page); await page.goto('/');
  for (const missing of [true,false]) {
    await page.evaluate(missing=>{window.testShouldersOnly=missing;window.testWeakHips=!missing;window.testRise=0;},missing);
    await enterPlay(page);
    expect((await state(page)).camera.trackingMode).toBe('shoulders');
    expect((await state(page)).anchorMode).toBe('shoulders');
    await page.getByLabel('Debug · show body skeleton').check();
    await expect(page.locator('#tracking-detail')).toContainText('2/2 shoulders');
    await page.evaluate(()=>{window.testRise=.06;});
    await expect.poll(async()=>(await state(page)).height).toBeGreaterThan(60);
    await page.screenshot({path:`test-results/ar-shoulders-${missing?'missing':'weak'}-waist.png`});
    await page.getByRole('button',{name:'Turn camera off'}).click(); await expectStopped(page);
  }
});

test('permission denial and cancellation of a late camera grant recover safely',async({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});
  await page.goto('/'); await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect(page.locator('#detail')).toContainText('Camera permission denied');
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.grant=()=>{const c=document.createElement('canvas');window.testStream=c.captureStream(0);resolve(window.testStream);};});});
  await page.getByRole('button',{name:'Retry camera',exact:true}).click();
  await page.getByRole('button',{name:'Turn camera off'}).click(); await page.evaluate(()=>window.grant());
  await expect.poll(()=>page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  expect((await state(page)).camera.state).toBe('off');
});

test('real local model on a public fixture produces pose output without external runtime requests',async({page,request})=>{
  let bytes;
  try {bytes=await readFile('../../../apps/motion-quest/tests/.cache/pose.jpg');}
  catch {const response=await request.get('https://storage.googleapis.com/mediapipe-assets/pose.jpg');expect(response.ok()).toBe(true);bytes=await response.body();}
  await page.addInitScript(data=>{navigator.mediaDevices.getUserMedia=async()=>{
    const image=new Image();image.src=data;
    await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
    const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const stream=c.captureStream(30);window.testStream=stream;
    const timer=setInterval(()=>{if(stream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer);else ctx.drawImage(image,0,0);},33);return stream;
  };},`data:image/jpeg;base64,${bytes.toString('base64')}`);
  const external=[],errors=[];
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5197')&&!r.url().startsWith('data:'))external.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect.poll(async()=>(await state(page)).camera.cue,{timeout:35000}).not.toBe(null);
  await page.getByRole('button',{name:'Turn camera off'}).click();
  await expectStopped(page); await expect.poll(()=>page.workers().length).toBe(0);
  expect(external).toEqual([]); expect(errors).toEqual([]);
});
