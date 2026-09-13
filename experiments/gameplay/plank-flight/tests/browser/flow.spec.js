import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function syntheticCamera(page){
  await page.addInitScript(()=>{
    window.testPose='high';window.testDelay=0;
    navigator.mediaDevices.getUserMedia=async()=>{
      const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');
      function draw(){ctx.fillStyle='#52675f';ctx.fillRect(0,0,640,480);ctx.strokeStyle='#e8c8ac';ctx.lineWidth=24;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(140,192);ctx.lineTo(294,202);ctx.lineTo(537,221);ctx.moveTo(140,192);ctx.lineTo(147,326);ctx.stroke();ctx.fillStyle='#f5d3b0';ctx.beginPath();ctx.arc(110,177,25,0,Math.PI*2);ctx.fill();}draw();
      const stream=c.captureStream(30);window.testStream=stream;
      const timer=setInterval(()=>{if(stream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer);else draw();},33);return stream;
    };
    window.Worker=class{
      constructor(){window.testWorker=this;}
      postMessage(data){
        if(data.type==='init'){setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);return;}
        data.bitmap.close();const p=[];
        if(window.testPose!=='missing'){
          const points=[[.22,.40],[.23,.54],[.23,.68],[.46,window.testPose==='rest'?.73:.42],[.65,.44],[.84,.46]];
          [[11,13,15,23,25,27],[12,14,16,24,26,28]].forEach(ids=>ids.forEach((id,i)=>p[id]={x:points[i][0],y:points[i][1],visibility:.99}));
          p[0]={x:.17,y:.37,visibility:.99};p[7]={x:.18,y:.36,visibility:.99};
        }
        setTimeout(()=>{if(!this.terminated)this.onmessage?.({data:{type:'pose',landmarks:p,time:data.time}});},window.testDelay);
      }
      terminate(){this.terminated=true;}
    };
  });
}
const state=page=>page.evaluate(()=>window.plankFlight.getState());
async function start(page){await page.getByRole('button',{name:'Enable camera',exact:true}).click();await expect.poll(async()=>(await state(page)).status).toBe('flying');}
async function cleaned(page){expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);}

test('synthetic camera AR: calibrate, local head crop, hold, rest, crash, encouragement and retry',async({page})=>{
  await syntheticCamera(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.screenshot({path:'test-results/ready.png',fullPage:true});await start(page);
  expect((await state(page)).headVisible).toBe(true);expect((await state(page)).source.kind).toBe('camera');
  await page.waitForTimeout(600);await page.screenshot({path:'test-results/synthetic-ar.png',fullPage:true});
  expect((await state(page)).holdSeconds).toBeGreaterThan(.4);
  const geometry=await page.evaluate(()=>{const a=document.querySelector('video').getBoundingClientRect(),b=document.querySelector('canvas').getBoundingClientRect();return {aligned:a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height,mirror:getComputedStyle(document.querySelector('video')).transform};});
  expect(geometry.aligned).toBe(true);expect(geometry.mirror).toContain('-1');
  await page.evaluate(()=>{window.testPose='rest';});await expect.poll(async()=>(await state(page)).releasedSeconds).toBeGreaterThan(.2);
  expect((await state(page)).status).toBe('flying');await expect.poll(async()=>(await state(page)).status).toBe('crashing');
  await page.screenshot({path:'test-results/crash.png',fullPage:true});await expect(page.getByRole('heading',{name:'You did so well.'})).toBeVisible();await cleaned(page);
  expect((await state(page)).headVisible).toBe(false);expect(errors).toEqual([]);
  await page.evaluate(()=>{window.testPose='high';});await page.getByRole('button',{name:'Fly again with camera'}).click();await expect.poll(async()=>(await state(page)).status).toBe('flying');
  await page.getByRole('button',{name:'Stop camera'}).click();await cleaned(page);
});
test('missing and delayed tracking pause without scoring fatigue; keyboard cannot override camera',async({page})=>{
  await syntheticCamera(page);await page.goto('/');await start(page);await page.keyboard.down('Space');
  await page.evaluate(()=>{window.testPose='missing';});await expect.poll(async()=>(await state(page)).status).toBe('paused');await cleaned(page);expect((await state(page)).reason).toBe(null);
  await page.evaluate(()=>{window.testPose='high';window.testDelay=400;});await page.getByRole('button',{name:'Start a fresh flight'}).click();await expect(page.getByRole('heading',{name:'Let’s find you again.'})).toBeVisible();expect((await state(page)).holdSeconds).toBe(0);await cleaned(page);
});
test('permission denial and late permission cancellation are recoverable',async({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});await page.goto('/');await page.getByRole('button',{name:'Enable camera'}).click();await expect(page.locator('#message')).toContainText('permission was denied');
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.grant=()=>{const c=document.createElement('canvas');c.width=640;c.height=480;window.testStream=c.captureStream(0);resolve(window.testStream);};});});
  await page.getByRole('button',{name:'Start a fresh flight'}).click();await page.getByRole('button',{name:'Stop camera'}).click();await page.evaluate(()=>window.grant());await expect.poll(()=>page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});
test('mobile synthetic demo supports pointer input, crashes and fits viewport',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Try a demo'}).click();
  const lift=page.getByRole('button',{name:'Hold to lift · Space'});await lift.scrollIntoViewIfNeeded();const box=await lift.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await expect.poll(async()=>(await state(page)).status).toBe('flying');await page.waitForTimeout(200);await page.mouse.up();
  await expect(page.getByRole('heading',{name:'You did so well.'})).toBeVisible({timeout:7000});expect((await state(page)).source.kind).toBe('synthetic');expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});
test('real local model on a public image emits head hint without external runtime requests',async({page,request})=>{
  let bytes;try{bytes=await readFile('../../../apps/motion-quest/tests/.cache/pose.jpg');}catch{const r=await request.get('https://storage.googleapis.com/mediapipe-assets/pose.jpg');expect(r.ok()).toBe(true);bytes=await r.body();}
  await page.addInitScript(data=>{navigator.mediaDevices.getUserMedia=async()=>{
    const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const stream=c.captureStream(30);window.testStream=stream;const timer=setInterval(()=>{if(stream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer);else ctx.drawImage(image,0,0);},33);return stream;
  };},`data:image/jpeg;base64,${bytes.toString('base64')}`);
  const external=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5185')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto('/');await page.getByRole('button',{name:'Enable camera'}).click();await expect.poll(async()=>(await state(page)).headVisible,{timeout:30000}).toBe(true);
  expect((await state(page)).status).toBe('waiting');await page.getByRole('button',{name:'Stop camera'}).click();await expect.poll(()=>page.workers().length).toBe(0);expect(external).toEqual([]);expect(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});

async function fillsWindow(page) {
  expect(await page.locator('.stage').evaluate(el => {
    const r=el.getBoundingClientRect();
    return r.x===0&&r.y===0&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1&&
      document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight;
  })).toBe(true);
}
test('game fills desktop and mobile windows with reachable overlay controls',async({page})=>{
  await page.goto('/');
  for(const viewport of [{width:1440,height:960},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);await fillsWindow(page);
    for(const id of ['start','demo','fullscreen']){
      const box=await page.locator(`#${id}`).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.screenshot({path:`test-results/full-window-${viewport.width}.png`});
  }
});
test('native fullscreen enter and exit preserve a synthetic camera flight',async({page})=>{
  await syntheticCamera(page);await page.goto('/');await start(page);const session=(await state(page)).sessionId;
  await page.getByRole('button',{name:'Enter fullscreen'}).click();
  await expect(page.getByRole('button',{name:'Exit fullscreen'})).toBeVisible();
  expect(await page.evaluate(()=>document.fullscreenElement?.classList.contains('stage'))).toBe(true);
  await fillsWindow(page);expect((await state(page)).status).toBe('flying');
  await page.getByRole('button',{name:'Exit fullscreen'}).click();
  await expect(page.getByRole('button',{name:'Enter fullscreen'})).toBeVisible();
  expect((await state(page)).sessionId).toBe(session);expect((await state(page)).cameraActive).toBe(true);
  await page.getByRole('button',{name:'Stop camera'}).click();await cleaned(page);
});
test('embedded fullscreen fallback and Escape preserve the flight and viewport',async({page})=>{
  await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw new Error('Embedded browser');};});
  await syntheticCamera(page);await page.goto('/');await start(page);
  await page.getByRole('button',{name:'Enter fullscreen'}).click();
  await expect(page.locator('#view-status')).toContainText('still fills this window');await fillsWindow(page);
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Enter fullscreen'})).toBeVisible();
  expect((await state(page)).status).toBe('flying');expect((await state(page)).cameraActive).toBe(true);
  await expect(page.locator('#view-status')).toBeEmpty();
  await page.getByRole('button',{name:'Stop camera'}).click();await cleaned(page);
});
