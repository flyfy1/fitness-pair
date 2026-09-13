import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function syntheticCamera(page){
  await page.addInitScript(()=>{
    window.testHeadX=.35;window.testHeadY=.3;window.testMissing=false;window.testHeadMissing=false;window.testDelay=0;
    navigator.mediaDevices.getUserMedia=async()=>{
      const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');
      function draw(){
        const x=window.testHeadX*640,y=window.testHeadY*480;
        ctx.fillStyle='#52675f';ctx.fillRect(0,0,640,480);ctx.strokeStyle='#e8c8ac';ctx.lineWidth=24;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(x-60,y+90);ctx.lineTo(x+60,y+90);ctx.stroke();
        ctx.fillStyle='#f5d3b0';ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();
      }draw();const stream=c.captureStream(30);window.testStream=stream;
      const timer=setInterval(()=>{if(stream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer);else draw();},33);return stream;
    };
    window.Worker=class{
      constructor(){window.testWorker=this;}
      postMessage(data){
        if(data.type==='init'){setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);return;}
        data.bitmap.close();const p=[];
        if(!window.testMissing){
          // Deliberately only one shoulder and a nose: no hips, wrists, knees or ankles.
          p[11]={x:window.testHeadX+.1,y:Math.min(.95,window.testHeadY+.18),visibility:.99};
          if(!window.testHeadMissing)p[0]={x:window.testHeadX,y:window.testHeadY,visibility:.99};
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
async function followsHead(page,x,y){
  await page.evaluate(({x,y})=>{window.testHeadX=x;window.testHeadY=y;},{x,y});
  await expect.poll(()=>page.evaluate(({x,y})=>{
    const r=document.querySelector('#scene').getBoundingClientRect(),s=window.plankFlight.getState();
    const scale=Math.max(r.width/640,r.height/480);
    return Math.max(Math.abs(s.x*r.width-((r.width-640*scale)/2+(1-x)*640*scale)),
      Math.abs(s.y*r.height-((r.height-480*scale)/2+y*480*scale)));
  },{x,y})).toBeLessThan(1);
}
test('close-up camera automatically starts; helicopter follows head down/up and sideways; collision, encouragement and retry',async({page})=>{
  await syntheticCamera(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.screenshot({path:'test-results/ready.png',fullPage:true});await start(page);
  expect(await page.locator('#body-overlay').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0))).toBe(true);
  expect((await state(page)).headVisible).toBe(true);expect((await state(page)).source.kind).toBe('camera');
  for(const [x,y] of [[.35,.6],[.35,.3],[.6,.3],[.25,.4]])await followsHead(page,x,y);
  await page.waitForTimeout(400);await followsHead(page,.25,.4); // no elapsed-time lift
  await page.screenshot({path:'test-results/close-up-ar.png',fullPage:true});
  const geometry=await page.evaluate(()=>{const a=document.querySelector('video').getBoundingClientRect(),b=document.querySelector('canvas').getBoundingClientRect();return {aligned:a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height,mirror:getComputedStyle(document.querySelector('video')).transform};});
  expect(geometry.aligned).toBe(true);expect(await page.locator('video').evaluate(el=>getComputedStyle(el).objectFit)).toBe('cover');expect(geometry.mirror).toContain('-1');
  await followsHead(page,.15,.8);
  const held=await state(page);await page.evaluate(()=>{window.testMissing=true;});
  await expect.poll(async()=>(await state(page)).trackingHeld).toBe(true);
  await page.waitForTimeout(500);expect((await state(page)).status).toBe('flying');
  expect((await state(page)).x).toBe(held.x);expect((await state(page)).y).toBe(held.y);
  expect((await state(page)).flightSeconds).toBeGreaterThan(held.flightSeconds+.3);
  await expect.poll(async()=>(await state(page)).status,{timeout:14000}).toBe('crashing');
  expect((await state(page)).reason).toBe('obstacle');await page.screenshot({path:'test-results/crash.png'});
  await expect(page.getByRole('heading',{name:'You did so well.'})).toBeVisible();await cleaned(page);
  expect((await state(page)).headVisible).toBe(false);expect(errors).toEqual([]);
  await page.evaluate(()=>{window.testHeadY=.3;window.testMissing=false;});await page.getByRole('button',{name:'Fly again with camera'}).click();
  await expect.poll(async()=>(await state(page)).status).toBe('flying');
  await page.getByRole('button',{name:'Finish & rest'}).click();await cleaned(page);
  await expect(page.getByRole('heading',{name:'You did so well.'})).toBeVisible();
});
test('brief loss and delayed frames hold position and automatically recover in the same round',async({page})=>{
  await syntheticCamera(page);await page.goto('/');await page.evaluate(()=>{window.testHeadMissing=true;});
  await page.getByRole('button',{name:'Enable camera'}).click();await expect(page.locator('#cue')).toContainText('Bring your head');
  expect((await state(page)).status).toBe('waiting');
  await page.evaluate(()=>{window.testHeadMissing=false;});await expect.poll(async()=>(await state(page)).status).toBe('flying');
  const initial=await state(page);await page.evaluate(()=>{window.testMissing=true;});
  await expect.poll(async()=>(await state(page)).trackingHeld).toBe(true);
  await page.waitForTimeout(3600);expect((await state(page)).status).toBe('flying');expect((await state(page)).cameraActive).toBe(true);
  expect((await state(page)).flightSeconds).toBeGreaterThan(initial.flightSeconds);expect((await state(page)).x).toBe(initial.x);
  await page.evaluate(()=>{window.testMissing=false;});await followsHead(page,.45,.3);
  await expect.poll(async()=>(await state(page)).trackingHeld).toBe(false);expect((await state(page)).sessionId).toBe(initial.sessionId);
  await page.evaluate(()=>{window.testDelay=650;});await expect.poll(async()=>(await state(page)).trackingHeld).toBe(true);
  expect((await state(page)).status).toBe('flying');
  await page.evaluate(()=>{window.testDelay=0;});await expect.poll(async()=>(await state(page)).trackingHeld).toBe(false);
  expect((await state(page)).sessionId).toBe(initial.sessionId);
  await page.getByRole('button',{name:'Finish & rest'}).click();await cleaned(page);
});
test('permission denial and late permission cancellation are recoverable',async({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});await page.goto('/');await page.getByRole('button',{name:'Enable camera'}).click();await expect(page.locator('.difficulty')).toBeHidden();await expect(page.locator('#language')).toBeHidden();await expect(page.locator('#message')).toContainText('permission was denied');
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.grant=()=>{const c=document.createElement('canvas');c.width=640;c.height=480;window.testStream=c.captureStream(0);resolve(window.testStream);};});});
  await page.getByRole('button',{name:'Start a fresh flight'}).click();await page.getByRole('button',{name:'Stop camera'}).click();await page.evaluate(()=>window.grant());await expect.poll(()=>page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});
test('mobile synthetic demo follows pointer and arrows, then ends with encouragement',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Try a demo'}).click();
  await expect.poll(async()=>(await state(page)).status).toBe('flying');
  await page.mouse.move(230,340);await expect.poll(async()=>(await state(page)).x).toBeCloseTo(230/390,3);
  await expect.poll(async()=>(await state(page)).y).toBeCloseTo(340/844,3);
  await page.keyboard.press('ArrowDown');await expect.poll(async()=>(await state(page)).y).toBeCloseTo(340/844+.04,3);
  await page.getByRole('button',{name:'Finish & rest'}).click();
  await expect(page.getByRole('heading',{name:'You did so well.'})).toBeVisible();expect((await state(page)).source.kind).toBe('synthetic');expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});
test('real local model on a public image emits head control without external runtime requests',async({page,request})=>{
  let bytes;try{bytes=await readFile('../../../apps/motion-quest/tests/.cache/pose.jpg');}catch{const r=await request.get('https://storage.googleapis.com/mediapipe-assets/pose.jpg');expect(r.ok()).toBe(true);bytes=await r.body();}
  await page.addInitScript(data=>{navigator.mediaDevices.getUserMedia=async()=>{
    const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const stream=c.captureStream(30);window.testStream=stream;const timer=setInterval(()=>{if(stream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer);else ctx.drawImage(image,0,0);},33);return stream;
  };},`data:image/jpeg;base64,${bytes.toString('base64')}`);
  const external=[];page.on('request',r=>{
    const url=new URL(r.url());
    // The shared cache loader imports its verified local bytes through same-origin blobs.
    const local=['http:','blob:'].includes(url.protocol)&&url.origin==='http://127.0.0.1:5185';
    if(!local&&url.protocol!=='data:')external.push(r.url());
  });
  await page.goto('/');await page.getByRole('button',{name:'Enable camera'}).click();await expect.poll(async()=>(await state(page)).headVisible,{timeout:30000}).toBe(true);
  await expect.poll(async()=>(await state(page)).status).toBe('flying');await page.getByRole('button',{name:'Finish & rest'}).click();
  await expect.poll(()=>page.workers().length).toBe(0);expect(external).toEqual([]);expect(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});
async function fillsWindow(page) {
  expect(await page.locator('.stage').evaluate(el=>{
    const r=el.getBoundingClientRect();return r.x===0&&r.y===0&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1&&
      document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight;
  })).toBe(true);
}
test('full-window and head alignment survive portrait and landscape resizing',async({page})=>{
  await syntheticCamera(page);await page.goto('/');
  for(const viewport of [{width:1440,height:960},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);await fillsWindow(page);
    for(const id of ['start','demo','fullscreen','sound','opening','speed','acceleration']){
      const box=await page.locator(`#${id}`).boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
    }
  }
  await start(page);await followsHead(page,.35,.3);await page.setViewportSize({width:390,height:844});
  await followsHead(page,.35,.3);await page.screenshot({path:'test-results/close-up-portrait.png'});
  await page.getByRole('button',{name:'Finish & rest'}).click();await cleaned(page);
});
test('native fullscreen enter and exit preserve close-up camera flight and head alignment',async({page})=>{
  await syntheticCamera(page);await page.goto('/');await start(page);const session=(await state(page)).sessionId;
  await page.getByRole('button',{name:'Enter fullscreen'}).click();await expect(page.getByRole('button',{name:'Exit fullscreen'})).toBeVisible();
  expect(await page.evaluate(()=>document.fullscreenElement?.classList.contains('stage'))).toBe(true);
  await fillsWindow(page);await followsHead(page,.35,.3);expect((await state(page)).status).toBe('flying');
  await page.getByRole('button',{name:'Exit fullscreen'}).click();await expect(page.getByRole('button',{name:'Enter fullscreen'})).toBeVisible();
  expect((await state(page)).sessionId).toBe(session);expect((await state(page)).cameraActive).toBe(true);
  await page.getByRole('button',{name:'Finish & rest'}).click();await cleaned(page);
});
test('embedded fullscreen fallback and Escape preserve flight',async({page})=>{
  await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw new Error('Embedded browser');};});
  await syntheticCamera(page);await page.goto('/');await start(page);
  await page.getByRole('button',{name:'Enter fullscreen'}).click();await expect(page.locator('#view-status')).toContainText('still fills this window');await fillsWindow(page);
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Enter fullscreen'})).toBeVisible();expect((await state(page)).status).toBe('flying');
  await expect(page.locator('#view-status')).toBeEmpty();await page.getByRole('button',{name:'Finish & rest'}).click();await cleaned(page);
});

test('initial settings apply and disappear from countdown through flight, results and retry',async({page})=>{
  await page.setViewportSize({width:844,height:390});await page.goto('/');
  for(const selector of ['.difficulty','.language-control','.current-speed'])
    await expect(page.locator(selector)).toBeVisible();
  await page.locator('#opening').press('End');await expect(page.locator('#opening-value')).toHaveText('6.0× plane');
  await page.locator('#speed').press('Home');await expect(page.locator('#speed-value')).toHaveText('0.4×');
  await page.locator('#acceleration').press('End');
  await page.getByRole('button',{name:'Try a demo'}).click();
  const settings={opening:6,speed:.4,acceleration:1.5};
  expect((await state(page)).difficulty).toEqual(settings);
  for(const selector of ['.difficulty','.language-control','.current-speed'])
    await expect(page.locator(selector)).toBeHidden();
  await expect(page.locator('#countdown')).toBeVisible();
  await expect.poll(async()=>(await state(page)).status).toBe('flying');
  await expect.poll(async()=>(await state(page)).speedGain).toBeGreaterThan(0);
  await page.mouse.move(430,180);await expect.poll(async()=>(await state(page)).x).toBeCloseTo(430/844,3);
  for(const selector of ['#stop','#sound','#fullscreen'])await expect(page.locator(selector)).toBeVisible();
  const cue=await page.locator('.cue').boundingBox();expect(cue.y).toBeGreaterThan(250);
  await page.screenshot({path:'test-results/flight-clear-stage.png'});
  await page.getByRole('button',{name:'Finish & rest'}).click();
  await expect(page.getByRole('heading',{name:'You did so well.'})).toBeVisible();
  await expect(page.locator('.difficulty')).toBeHidden();
  await page.getByRole('button',{name:'Try a demo'}).click();
  expect((await state(page)).difficulty).toEqual(settings);
  await expect(page.locator('.difficulty')).toBeHidden();
  await page.reload();await expect(page.locator('.difficulty')).toBeVisible();
});


test('spoken countdown starts the beat; mute, unmute and cancel control actual audio output',async({page})=>{
  await page.addInitScript(()=>{
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      createDynamicsCompressor(){
        const node=super.createDynamicsCompressor(),connect=node.connect.bind(node);
        node.connect=target=>{const analyser=this.createAnalyser();analyser.fftSize=1024;
          connect(analyser);analyser.connect(target);window.testAudioAnalyser=analyser;return target;};
        return node;
      }
    };
  });
  await page.goto('/');await page.getByRole('button',{name:'Try a demo'}).click();
  for(const [label,cue] of [['3','three'],['2','two'],['1','one']]){
    await expect(page.locator('#countdown')).toHaveText(label);
    await expect.poll(async()=>(await state(page)).audio.lastCue).toBe(cue);
    expect((await state(page)).flightSeconds).toBe(0);expect((await state(page)).obstacles).toHaveLength(0);
  }
  await expect(page.locator('#countdown')).toHaveText('START!');
  await expect.poll(async()=>(await state(page)).audio.lastCue).toBe('start');
  await expect.poll(async()=>(await state(page)).audio.voicesReady).toBe(7);
  const level=()=>page.evaluate(()=>{
    const a=window.testAudioAnalyser;if(!a)return 0;const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);
    return Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);
  });
  await expect.poll(level).toBeGreaterThan(.002);
  await page.getByRole('button',{name:'Mute sound',exact:true}).click();
  await expect.poll(async()=>(await state(page)).audio.state).toBe('suspended');
  const session=(await state(page)).sessionId;
  await page.getByRole('button',{name:'Enable sound',exact:true}).click();
  await expect.poll(async()=>(await state(page)).audio.state).toBe('running');
  await expect.poll(level).toBeGreaterThan(.002);expect((await state(page)).sessionId).toBe(session);
  await page.getByRole('button',{name:'Finish & rest'}).click();
  await expect.poll(async()=>(await state(page)).audio.lastCue).toBe('finish');
  await page.getByRole('button',{name:'Try a demo'}).click();await expect(page.locator('#countdown')).toHaveText('3');
  await page.getByRole('button',{name:'Cancel countdown'}).click();
  await page.waitForTimeout(3200);expect((await state(page)).status).toBe('paused');
  expect((await state(page)).audio.state).toBe('suspended');await expect(page.locator('#countdown')).toBeHidden();
});

test('camera countdown preserves held controls and starts only once after tracking loss',async({page})=>{
  await syntheticCamera(page);await page.goto('/');await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect(page.locator('#countdown')).toHaveText('3');const initial=await state(page);
  await page.evaluate(()=>{window.testMissing=true;});
  await expect.poll(async()=>(await state(page)).trackingHeld).toBe(true);
  await expect.poll(async()=>(await state(page)).status).toBe('flying');
  expect((await state(page)).sessionId).toBe(initial.sessionId);expect((await state(page)).x).toBe(initial.x);
  await page.evaluate(()=>{window.testMissing=false;});await followsHead(page,.4,.3);
  expect((await state(page)).status).toBe('flying');
  await page.getByRole('button',{name:'Finish & rest'}).click();await cleaned(page);
});

test('phone can start upright after a rejected rotation and keep the same camera session through resizing',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    Element.prototype.requestFullscreen=async()=>{throw new Error('Fullscreen unavailable');};
    screen.orientation.lock=async()=>{throw new Error('Lock unavailable');};
  });
  await syntheticCamera(page);await page.goto('http://127.0.0.1:5185/');
  await page.locator('#orientation').selectOption('landscape');
  await expect(page.locator('#orientation-status')).toContainText('You can still start');
  await page.getByRole('button',{name:'Try a demo'}).click();
  await expect.poll(async()=>(await state(page)).status).toBe('flying');
  await expect(page.locator('#orientation-controls')).toBeHidden();
  await page.mouse.move(210,340);await expect.poll(async()=>(await state(page)).x).toBeCloseTo(210/390,3);
  await page.screenshot({path:'test-results/phone-portrait-play.png'});
  await page.getByRole('button',{name:'Finish & rest'}).click();
  await expect(page.getByRole('heading',{name:'You did so well.'})).toBeVisible();
  await page.locator('#start').click();await expect.poll(async()=>(await state(page)).status).toBe('flying');
  const session=(await state(page)).sessionId;
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){
    await page.setViewportSize(viewport);await followsHead(page,.35,.3);
    expect((await state(page)).sessionId).toBe(session);expect((await state(page)).status).toBe('flying');
    expect((await state(page)).cameraActive).toBe(true);
  }
  await page.getByRole('button',{name:'Finish & rest'}).click();await cleaned(page);
  expect(errors).toEqual([]);await context.close();
});

test('phone can choose portrait from landscape and starting releases the optional native lock',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  await page.addInitScript(()=>{
    window.orientationCalls=[];
    Element.prototype.requestFullscreen=async()=>{window.orientationCalls.push('fullscreen');};
    screen.orientation.lock=async value=>{window.orientationCalls.push(value);};
    screen.orientation.unlock=()=>{window.orientationCalls.push('unlock');};
  });
  await page.goto('http://127.0.0.1:5185/');await page.locator('#orientation').selectOption('portrait');
  await expect.poll(()=>page.evaluate(()=>window.orientationCalls)).toEqual(['unlock','fullscreen','portrait']);
  // The stub proves API wiring; viewport rotation models the native browser response.
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Try a demo'}).click();
  await expect.poll(async()=>(await state(page)).status).toBe('flying');
  expect(await page.evaluate(()=>window.orientationCalls.at(-1))).toBe('unlock');
  await context.close();
});

test('missing and stalled rotation APIs never block portrait entry',async({browser})=>{
  for(const failure of ['missing','rejected','stalled']){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(failure=>{
      Element.prototype.requestFullscreen=async()=>{};
      screen.orientation.lock=failure==='missing'?undefined:failure==='stalled'?()=>new Promise(()=>{}):async()=>{throw Error('Orientation unavailable');};
    },failure);
    await page.goto('http://127.0.0.1:5185/');await page.locator('#orientation').selectOption('landscape');
    await page.getByRole('button',{name:'Try a demo'}).click();
    await expect.poll(async()=>(await state(page)).status).toBe('flying');
    expect(errors).toEqual([]);await context.close();
  }
});


test('narrow phone exposes camera entry before scrolling and setup can be scrolled by touch',async({browser})=>{
  const context=await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true});
  const page=await context.newPage();await page.goto('http://127.0.0.1:5185/');
  const panel=await page.locator('#panel').boundingBox(),start=await page.locator('#start').boundingBox();
  expect(start.y).toBeGreaterThanOrEqual(panel.y);
  expect(start.y+start.height).toBeLessThanOrEqual(panel.y+panel.height);
  const session=await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:440}]});
  for(const y of [410,380,350,320]){
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160,y}]});
    await page.waitForTimeout(30);
  }
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.locator('#panel').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await page.locator('#demo').click();await expect.poll(async()=>(await state(page)).status).toBe('flying');
  await context.close();
});
