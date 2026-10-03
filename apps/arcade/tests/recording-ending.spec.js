import {test,expect} from '@playwright/test';
import {startPreview,finishPreview} from './motion-preview.js';
import {openReplay} from './open-replay.js';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

async function unsupportedEnding(page,mainProfile=false){
 await page.addInitScript(mainProfile=>{
  if(window!==window.top)return;
  if(mainProfile){
   const NativeRecorder=MediaRecorder;
   window.MediaRecorder=class extends NativeRecorder{
    constructor(stream,options){super(stream,{...options,mimeType:`video/mp4;codecs=avc1.4d0028${stream.getAudioTracks().length?',mp4a.40.2':''}`});}
   };
  }else{
   // A device can record natively without a separate WebCodecs ending encoder.
   window.VideoEncoder=undefined;
  }
  window.recordingStreams=[];
  const capture=HTMLCanvasElement.prototype.captureStream;
  HTMLCanvasElement.prototype.captureStream=function(...args){const stream=capture.apply(this,args);window.recordingStreams.push(stream);return stream;};
 },mainProfile);
}
async function savedClip(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
 const request=indexedDB.open('fitness-pair-clips',1);request.onerror=()=>reject(request.error);
 request.onsuccess=()=>{const db=request.result,q=db.transaction('clips').objectStore('clips').getAll();q.onsuccess=()=>{db.close();resolve(q.result.sort((a,b)=>b.createdAt-a.createdAt).map(({blob,...clip})=>({...clip,size:blob.size}))[0]);};};
}));}
async function sample(video,time){return video.evaluate(async(v,time)=>{
 const seek=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Seek timed out.')),5000);v.onseeked=()=>{clearTimeout(timer);resolve();};});v.currentTime=time;await seek;
 const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(v,0,0);
 return [...ctx.getImageData(10,canvas.height-15,1,1).data];
},time);}
const yellow=p=>p[0]>200&&p[1]>200&&p[2]<100;

for(const mainProfile of [false,true])test(`${mainProfile?'Main AVC recording':'Device without a splice encoder'} records a silent three-second ending once; download and upload reuse that file`,async({page},info)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await unsupportedEnding(page,mainProfile);await page.setViewportSize({width:390,height:844});
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await startPreview(page,game);await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await finishPreview(page,game);
 await expect(page.locator('#record-status')).toContainText('3-second invitation');
 await expect(page.locator('#record-status')).toContainText('Saved on this device',{timeout:10000});
 const clip=await savedClip(page);expect(clip.hasEnding).toBe(true);expect(clip.branded).toBe(true);expect(clip.endingSeconds).toBeCloseTo(3,1);expect(clip.duration).toBeLessThan(90);
 const card=page.locator('#local-result .clip-card'),video=card.locator('video');await openReplay(video);
 expect(yellow(await sample(video,.3))).toBe(false);expect(yellow(await sample(video,clip.duration-.2))).toBe(true);
 const source=Buffer.from(await video.evaluate(async v=>Array.from(new Uint8Array(await(await fetch(v.src)).arrayBuffer()))));
 const audio=await video.evaluate(async v=>{
  const context=new AudioContext();try{const buffer=await context.decodeAudioData(await(await fetch(v.src)).arrayBuffer()),data=buffer.getChannelData(0);
   const rms=values=>Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length);
   return {game:rms(data.slice(0,Math.floor(buffer.sampleRate*2))),ending:rms(data.slice(-buffer.sampleRate))};
  }finally{await context.close();}
 });
 expect(audio.game).toBeGreaterThan(.0001);expect(audio.ending).toBeLessThan(.00001);
 const download=page.waitForEvent('download');await card.locator('.clip-actions [download]').click();
 const path=info.outputPath('same-encoder-ending.mp4');await(await download).saveAs(path);expect(await readFile(path)).toEqual(source);
 let uploaded;
 await page.route('**/api/config',r=>r.fulfill({json:{sharingEnabled:true}}));
 await page.route('**/api/auth/session',r=>r.fulfill({json:{enabled:true,user:{email:'synthetic@example.test'},csrfToken:'test-only'}}));
 await page.route('**/api/account/clips',r=>r.fulfill({json:{clips:[],usedBytes:0,limitBytes:2e9}}));
 await page.route('**/api/clips/*',r=>{if(r.request().method()==='PUT')uploaded=r.request().postDataBuffer();return r.fulfill({json:{url:'/clips/test-only',expiresAt:null}});});
 await page.route('**/api/posters/*',r=>r.fulfill({json:{ok:true}}));
 await card.getByRole('button',{name:'Upload & share',exact:true}).click();await card.locator('input[name=consent]').check();await card.getByRole('button',{name:'Upload this clip',exact:false}).click();
 await expect(card.getByRole('link',{name:'Open shared video',exact:false})).toBeVisible();expect(uploaded).toEqual(source);
 expect(await page.evaluate(()=>window.recordingStreams.flatMap(s=>s.getTracks()).every(t=>t.readyState==='ended'))).toBe(true);
 if(process.platform==='darwin'){
  const {stdout}=await promisify(execFile)('swift',['scripts/check-mp4-native.swift',path]);const native=JSON.parse(stdout);
  expect(native.playable).toBe(true);expect(native.completed).toBe(true);expect(native.audioCompleted).toBe(true);expect(yellow(native.last)).toBe(true);expect(yellow(native.boundary)).toBe(true);expect(yellow(native.back)).toBe(false);
 }
 expect(errors).toEqual([]);
});

test('backgrounding during the invitation immediately stops owned tracks and saves the partial ending',async({page})=>{
 await unsupportedEnding(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await startPreview(page,game);await finishPreview(page,game);await expect(page.locator('#record-status')).toContainText('3-second invitation');
 await page.waitForTimeout(300);
 const started=Date.now();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(()=>page.evaluate(()=>window.recordingStreams.flatMap(s=>s.getTracks()).every(t=>t.readyState==='ended'))).toBe(true);expect(Date.now()-started).toBeLessThan(1500);
 await expect.poll(async()=>!!await savedClip(page)).toBe(true);const clip=await savedClip(page);
 expect(clip.hasEnding).toBe(true);expect(clip.endingSeconds).toBeGreaterThan(.2);expect(clip.endingSeconds).toBeLessThan(2);
});

test('a new round starts while the previous invitation finishes without revealing the old replay',async({page})=>{
 await unsupportedEnding(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await startPreview(page,game);await finishPreview(page,game);await expect(page.locator('#record-status')).toContainText('3-second invitation');
 await game.locator('#again').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#local-result video')).toHaveCount(1,{timeout:8000});expect(await page.evaluate(()=>scrollY)).toBe(0);
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');await expect(game.locator('[data-replay-share]')).toBeHidden();
 const tracks=await page.evaluate(()=>window.recordingStreams.map(stream=>stream.getVideoTracks()[0].readyState));expect(tracks).toEqual(['ended','live']);
});
