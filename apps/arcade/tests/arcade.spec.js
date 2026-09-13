import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {syntheticCamera} from '../../camera-start/tests/browser/synthetic-camera.js';
test('landing has a direct arcade path and a factual build story',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page).toHaveTitle('Hopmodo — Games that get you moving');
 await expect(page.getByRole('link',{name:'Hopmodo home',exact:true}).first()).toBeVisible();
 await expect(page.getByRole('heading',{name:/Games that get you moving\./i})).toBeVisible();
 await page.getByRole('link',{name:'Take me to the arcade',exact:true}).first().click();await expect(page).toHaveURL(/#arcade$/);
 await expect(page.locator('.game-art').first()).toBeInViewport();
 await page.getByRole('link',{name:'How we built it',exact:true}).click();await expect(page.getByRole('heading',{name:'BUILDING THE ARCADE WITH ASTRA.'})).toBeInViewport();
 expect(errors).toEqual([]);
});
test('mobile layout fits and reduced motion starts paused',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 await expect(page.getByRole('button',{name:'Play motion',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('link',{name:'Take me to the arcade',exact:true}).first()).toBeInViewport();
});
test('concept is labeled and can complete with a keyboard',async({page})=>{
 await page.goto('/play/orbit-pop');await expect(page.getByText('Interactive concept · button simulation · no camera')).toBeVisible();
 const target=page.getByRole('button',{name:'Pop the orbit',exact:true});for(let i=0;i<10;i++)await target.press('Enter');
 await expect(page.getByText(/Ten pops/)).toBeVisible();await page.getByRole('button',{name:'Start again'}).click();await expect(target).toBeVisible();await expect(page.locator('#pop-score')).toHaveText('0');
});
test('Dino starts a local replay with keyboard play and keeps it through pause',async({page})=>{
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await expect(page.getByRole('button',{name:'Record my game',exact:true})).toHaveCount(0);
 await expect(page.locator('#record-status')).toContainText('records automatically');
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(game.locator('#pause')).toBeEnabled();await game.locator('#pause').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect.poll(()=>page.evaluate(()=>document.querySelector('#game-frame').contentWindow.dinoGame.getState().status)).toBe('paused');
 expect(await page.evaluate(()=>document.querySelector('#game-frame').contentDocument.querySelector('#camera').srcObject===null)).toBe(true);
});
test('synthetic Motion Quest recording saves locally, survives reload, and never uploads',async({page})=>{
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  window.shareMode='ok';window.sharedFile=null;
  Object.defineProperty(navigator,'canShare',{value:()=>window.shareMode!=='unsupported',configurable:true});
  Object.defineProperty(navigator,'share',{value:async data=>{
   if(window.shareMode==='cancel')throw new DOMException('Cancelled','AbortError');
   if(window.shareMode==='error')throw new Error('Share failed');
   window.sharedFile={name:data.files[0].name,size:data.files[0].size,type:data.files[0].type,text:data.text};
  },configurable:true});
 });
 const uploads=[];page.on('request',r=>{if(r.method()==='PUT')uploads.push(r.url());});await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await game.locator('#demo').click();
 await expect(page.locator('#record-status')).toContainText('Recording');
 for(let i=0;i<5;i++){await game.locator('#demo-action').focus();await page.keyboard.down('Space');await page.waitForTimeout(750);await page.keyboard.up('Space');}
 await expect(game.locator('#rep-count')).toHaveText('5');await expect(page.locator('#record-status')).toContainText('Saved on this device',{timeout:12000});
 await expect(page.locator('#local-result video')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Your replay is ready.'})).toBeFocused();
 await page.goto('/library');await expect(page.getByRole('heading',{name:'Motion Quest · my replay'})).toBeVisible();
 await page.reload();await expect(page.locator('video')).toHaveCount(1);await page.locator('video').evaluate(v=>v.play());await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);
 const video=page.locator('video');
 const pixels=await video.evaluate(async v=>{
  v.pause();v.currentTime=.5;await new Promise(resolve=>v.addEventListener('seeked',resolve,{once:true}));
  const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d');ctx.drawImage(v,0,0);
  window.decodedClip=c.toDataURL();
  const region=(x,y,w,h)=>{const data=ctx.getImageData(x,y,w,h).data;let blue=0,ink=0;for(let i=0;i<data.length;i+=4){if(data[i+2]>150&&data[i]<100)blue++;if(data[i]<100&&data[i+1]<100&&data[i+2]<130)ink++;}return {blue,ink};};
  return {width:c.width,height:c.height,logo:region(20,736,48,48),name:region(78,736,160,48),website:region(800,755,450,35)};
 });
 expect(pixels.width).toBe(1280);expect(pixels.height).toBe(800);expect(pixels.logo.blue).toBeGreaterThan(100);expect(pixels.name.blue).toBeGreaterThan(300);expect(pixels.website.ink).toBeGreaterThan(400);
 const endCard=await video.evaluate(async v=>{
  v.currentTime=Math.max(0,v.duration-.15);await new Promise(resolve=>v.addEventListener('seeked',resolve,{once:true}));
  const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d');ctx.drawImage(v,0,0);
  const data=ctx.getImageData(300,270,680,90).data;let yellow=0;for(let i=0;i<data.length;i+=4)if(data[i]>170&&data[i+1]>180&&data[i+2]<140)yellow++;return yellow;
 });
 expect(endCard).toBeGreaterThan(600);
 await page.getByRole('button',{name:'Share with a friend'}).click();
 const shared=await page.evaluate(()=>window.sharedFile);expect(shared.name).toBe('hopmodo-motion-quest.mp4');expect(shared.type).toBe('video/mp4');expect(shared.size).toBeGreaterThan(1000);expect(shared.text).toContain('https://fitness-pair-playground.rajatsg18.chatgpt.site/play/motion-quest');
 await page.evaluate(()=>{window.shareMode='cancel';});await page.getByRole('button',{name:'Share with a friend'}).click();await expect(page.getByText('Sharing cancelled. Your clip is still here.')).toBeVisible();
 await page.evaluate(()=>{window.shareMode='unsupported';});await page.getByRole('button',{name:'Share with a friend'}).click();await expect(page.getByText(/This browser cannot share video files directly/)).toBeVisible();
 const downloadEvent=page.waitForEvent('download');await page.getByRole('link',{name:'Download',exact:true}).click();const download=await downloadEvent;expect(download.suggestedFilename()).toBe('hopmodo-motion-quest.mp4');
 const downloaded=await readFile(await download.path());expect(downloaded.subarray(4,8).toString()).toBe('ftyp');
 await page.getByRole('button',{name:'Publish to gallery'}).click();await expect(page.getByText(/Gallery sharing isn’t available yet/)).toBeVisible();expect(uploads).toEqual([]);
 await page.getByRole('button',{name:'Delete local clip'}).click();await expect(page.locator('video')).toHaveCount(0);
});
test('gallery and missing clips have usable honest states',async({page})=>{
 await page.goto('/gallery');await expect(page.getByRole('heading',{name:'SHARING IS COMING SOON.'})).toBeVisible();await expect(page.locator('video')).toHaveCount(0);
 await page.goto('/clips/550e8400-e29b-41d4-a716-446655440000');await expect(page.getByRole('heading',{name:'CLIP UNAVAILABLE.'})).toBeVisible();
});

test('waiting for a game creates no recording and has no opt-in control',async({page})=>{
 await page.goto('/play/motion-quest');
 await expect(page.locator('#record-status')).toContainText('records automatically');
 await expect(page.locator('#record-panel button')).toHaveCount(0);
 await page.waitForTimeout(600);
 await page.goto('/library');await expect(page.getByRole('heading',{name:'NO CLIPS YET.'})).toBeVisible();
});
test('Dino recording starts with gameplay and saves automatically at game over',async({page})=>{
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.getByRole('heading',{name:'Your replay is ready.'})).toBeVisible({timeout:20000});
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','idle');await expect(page.getByRole('button',{name:'Share with a friend'})).toBeVisible();
});

test('synthetic camera fixture is mirrored behind AR layers and recorder releases only its capture track',async({page})=>{
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  window.recordingStreams=[];const original=HTMLCanvasElement.prototype.captureStream;
  HTMLCanvasElement.prototype.captureStream=function(...args){const stream=original.apply(this,args);window.recordingStreams.push(stream);return stream;};
 });
 await page.goto('/play/motion-quest');
 await page.evaluate(async()=>{
  const frame=document.querySelector('#game-frame');if(frame.contentDocument.readyState!=='complete')await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  const doc=frame.contentDocument,canvas=doc.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#ff0000';ctx.fillRect(0,0,320,480);ctx.fillStyle='#00ff00';ctx.fillRect(320,0,320,480);
  const video=doc.querySelector('#camera');video.srcObject=canvas.captureStream(24);await video.play();
  window.syntheticCamera=video.srcObject;doc.querySelector('#start').hidden=true;
  frame.contentWindow.motionQuest.getReplayState=()=>({roundId:'compositor-fixture',phase:doc.querySelector('#rep-count').textContent==='5'?'complete':'playing'});
 });
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.waitForTimeout(1200);await page.evaluate(()=>{document.querySelector('#game-frame').contentDocument.querySelector('#rep-count').textContent='5';});
 await expect(page.locator('#local-result video')).toBeVisible();
 const sample=await page.locator('#local-result video').evaluate(async v=>{
  await v.play();v.pause();v.currentTime=.5;await new Promise(resolve=>v.addEventListener('seeked',resolve,{once:true}));
  const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(v,0,0);
  const source=document.querySelector('#game-frame').contentDocument.querySelector('#game');const scale=Math.min(1280/source.width,800/source.height),w=source.width*scale,h=source.height*scale,x=(1280-w)/2,y=(800-h)/2;
  return {left:[...ctx.getImageData(Math.round(x+w*.25),Math.round(y+h*.2),1,1).data],right:[...ctx.getImageData(Math.round(x+w*.75),Math.round(y+h*.2),1,1).data]};
 });
 expect(sample.left[1]).toBeGreaterThan(200);expect(sample.left[0]).toBeLessThan(40);expect(sample.right[0]).toBeGreaterThan(200);expect(sample.right[1]).toBeLessThan(40);
 expect(await page.evaluate(()=>window.recordingStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
 expect(await page.evaluate(()=>window.syntheticCamera.getTracks()[0].readyState)).toBe('live');
 await page.evaluate(()=>window.syntheticCamera.getTracks().forEach(t=>t.stop()));
});

test('a second Dino round gets its own replay without rearming or duplicate clips',async({page})=>{
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','idle',{timeout:20000});
 await page.waitForTimeout(600);await expect(page.locator('#record-panel')).toHaveAttribute('data-state','idle');
 await game.locator('#start').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','idle',{timeout:20000});
 await page.goto('/library');await expect(page.locator('video')).toHaveCount(2);
});
test('replays do not stop at the former 60-second cutoff',async({page})=>{
 await page.clock.install();await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await game.locator('#demo').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.clock.fastForward(65000);
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#record-status')).toContainText('65 seconds');
 await expect(page.locator('#local-result')).toBeHidden();
});

test('an immediate restart records without focusing the previous replay',async({page})=>{
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await expect(game.locator('[data-replay-share]')).toBeVisible({timeout:15000});
 await game.locator('#start').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:1200});
 await expect(page.locator('#local-result video')).toHaveCount(1,{timeout:4500});
 await expect(page.getByRole('heading',{name:'Your replay is ready.'})).not.toBeFocused();
 await expect(page.locator('#local-result video')).toHaveCount(2,{timeout:12000});
});
test('a backgrounded preview resumes automatic capture when visible again',async({page})=>{
 await page.goto('/play/motion-quest');await page.frameLocator('#game-frame').locator('#demo').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');await page.waitForTimeout(600);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','idle');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.waitForTimeout(600);await page.evaluate(()=>{document.querySelector('#game-frame').contentWindow.motionQuest.getReplayState=()=>({roundId:document.querySelector('#game-frame').contentDocument.documentElement.dataset.roundId,phase:'complete'});});
 await expect(page.locator('#local-result video')).toHaveCount(2,{timeout:7000});
});
test('storage failure preserves download fallbacks from consecutive rounds',async({page})=>{
 await page.addInitScript(()=>{if(window===window.top)Object.defineProperty(window,'indexedDB',{get(){throw new Error('Storage blocked for fixture');}});});
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await expect(page.locator('#local-result video')).toHaveCount(1,{timeout:20000});
 const firstURL=await page.locator('#local-result video').getAttribute('src');
 await game.locator('#start').click();await expect(page.locator('#local-result video')).toHaveCount(2,{timeout:20000});
 await expect(page.getByText(/Not saved — download before leaving/)).toHaveCount(2);
 expect(await page.evaluate(async url=>(await fetch(url)).status,firstURL)).toBe(200);
 await expect(page.locator('#local-result a[download]')).toHaveCount(2);
});

test('only the original three games are listed and all tracking assets remain available',async({page,request})=>{
 await page.goto('/');
 await expect(page.locator('.game-card')).toHaveCount(3);
 for(const id of ['dino-run','dino-ar','orbit-pop','ar-breakout','ar-invaders','ar-stack','ar-knife','ar-bubble','ar-fruit'])await expect(page.locator(`a[href="/play/${id}"]`)).toHaveCount(0);
 for(const title of ['Motion Quest','Push-up Flight','Jump Game'])await expect(page.getByRole('link',{name:'Play '+title,exact:true})).toBeVisible();
 for(const game of ['motion-quest','dino-run','dino-ar','plank-flight','camera-start','ar-breakout','ar-invaders','ar-stack','ar-knife','ar-bubble','ar-fruit']){
  const script=await request.get(`/games/${game}/runtime/pose-worker.js`);expect(script.status()).toBe(200);expect(script.headers()['content-type']).toContain('javascript');expect(await script.text()).toContain('onmessage');
  const wasm=await request.get(`/games/${game}/runtime/wasm/vision_wasm_internal.wasm`);expect(wasm.status()).toBe(200);expect(wasm.headers()['content-type']).toBe('application/wasm');
 }
});
test('Dino AR keyboard rounds produce local replays',async({page})=>{
 await page.goto('/play/dino-ar');const game=page.frameLocator('#game-frame');
 await expect(game.locator('.privacy')).toContainText('record automatically');
 await game.locator('#primary').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#local-result video')).toBeVisible({timeout:20000});
 await expect(page.getByRole('heading',{name:'Dino AR · my replay'})).toBeVisible();
 await game.locator('#primary').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
});
test('Push-up Flight demo records the crash sequence and saves automatically',async({page})=>{
 const uploads=[];page.on('request',r=>{if(r.method()==='PUT')uploads.push(r.url());});
 await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
 await game.locator('#demo').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.waitForTimeout(900);await game.locator('#stop').click();
 await expect.poll(()=>page.evaluate(()=>document.querySelector('#game-frame').contentWindow.plankFlight.getState().status)).toBe('crashing');
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#local-result video')).toBeVisible({timeout:10000});expect(uploads).toEqual([]);
 await expect(page.getByRole('heading',{name:'Push-up Flight · my replay'})).toBeVisible();
});

test('guided camera Dino calibrates and saves a replay on manual finish with synthetic camera input',async({page})=>{
 await syntheticCamera(page);await page.goto('/play/camera-start');const game=page.frameLocator('#game-frame');
 await expect(game.locator('#feedback')).toContainText('records on this device');
 await game.locator('#primary').click();await expect(game.locator('#instruction')).toHaveText('Standing pose captured.',{timeout:12000});
 await game.locator('#primary').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:12000});
 await page.waitForTimeout(900);await game.locator('#show-settings').click();await game.locator('#end-run').click();
 await expect(page.locator('#local-result video')).toBeVisible({timeout:10000});
 await expect(page.getByRole('heading',{name:'Jump Game · my replay'})).toBeVisible();
 expect(await page.evaluate(()=>document.querySelector('#game-frame').contentWindow.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});

test('a WebM-only encoder saves genuine WebM with an explicit fallback notice',async({page},info)=>{
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  const supports=MediaRecorder.isTypeSupported.bind(MediaRecorder);
  MediaRecorder.isTypeSupported=mime=>!mime.startsWith('video/mp4')&&supports(mime);
 });
 await page.goto('/play/motion-quest');
 await page.frameLocator('#game-frame').locator('#demo').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');await page.waitForTimeout(700);
 await page.evaluate(()=>{const doc=document.querySelector('#game-frame').contentDocument;document.querySelector('#game-frame').contentWindow.motionQuest.getReplayState=()=>({roundId:doc.documentElement.dataset.roundId,phase:'complete'});});
 await expect(page.locator('#local-result video')).toBeVisible({timeout:12000});
 await expect(page.getByText(/This browser saved WebM/)).toBeVisible();
 const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Download',exact:true}).click();const file=await pending;
 expect(file.suggestedFilename()).toBe('hopmodo-motion-quest.webm');await file.saveAs(info.outputPath('synthetic-audio.webm'));
 const bytes=await readFile(await file.path());expect([...bytes.subarray(0,4)]).toEqual([26,69,223,163]);
 await page.locator('#local-result video').evaluate(v=>v.play());
 await expect.poll(()=>page.locator('#local-result video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);
});
