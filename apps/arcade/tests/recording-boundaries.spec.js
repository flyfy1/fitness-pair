import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {movingCamera} from './moving-camera.js';

const inGame=(page,fn,arg)=>page.frames().find(frame=>frame.url().includes('/games/motion-quest/')).evaluate(fn,arg);
async function sample(page,label){
 return page.evaluate(label=>{
  const w=document.querySelector('#game-frame').contentWindow;
  return {label,time:(Date.now()-window.recordStarted)/1000,phase:w.document.querySelector('#game').dataset.effectPhase};
 },label);
}

test('calibrated synthetic camera round retains charge, final projectile, impact, victory and game audio without a promotional ending',async({page},info)=>{
 test.setTimeout(90000);
 await movingCamera(page,{controlled:true});
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  window.recordStarts=[];const start=MediaRecorder.prototype.start;
  MediaRecorder.prototype.start=function(...args){window.recordStarted=Date.now();window.recordStarts.push(window.recordStarted);return start.apply(this,args);};
 });
 const uploads=[];page.on('request',r=>{if(r.method()==='PUT')uploads.push(r.url());});
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await expect(game.locator('#start')).toBeVisible();await page.waitForTimeout(250);
 expect(await inGame(page,()=>window.cameraRequests||0)).toBe(0);
 await game.locator('#start').click();await page.waitForTimeout(300);
 expect(await page.evaluate(()=>window.recordStarts.length)).toBe(0);
 await inGame(page,()=>window.allowCamera());await expect(game.locator('#start')).toContainText('Loading');
 await page.waitForTimeout(300);expect(await page.evaluate(()=>window.recordStarts.length)).toBe(0);
 await inGame(page,()=>window.readyModel());await expect(game.locator('#arena-title')).toHaveText('Hold still');
 await page.waitForTimeout(500);expect(await page.evaluate(()=>window.recordStarts.length)).toBe(0);
 await expect(game.locator('#arena-title')).toHaveText('Squat down');
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 expect(await inGame(page,()=>window.motionQuest.getReplayState().charge)).toBe(0);
 const samples=[await sample(page,'ready')];
 await page.evaluate(()=>{
  const w=document.querySelector('#game-frame').contentWindow;window.finalSamples=[];
  w.addEventListener('motionquest:replay-state',()=>{
   if(w.motionQuest.getReplayState().phase!=='ending')return;
   for(const [label,delay] of [['projectile',160],['impact',720],['victory',1400]])setTimeout(()=>window.finalSamples.push({label,time:(Date.now()-window.recordStarted)/1000,phase:w.document.querySelector('#game').dataset.effectPhase,cameraOff:w.testStream.getTracks().every(t=>t.readyState==='ended'),victoryHidden:w.document.querySelector('#victory').hidden}),delay);
  });
 });
 // Tracking loss after start remains in the same local round; it never scores.
 await inGame(page,()=>{window.testMissing=true;});await expect(game.locator('#arena-title')).toHaveText('Step into view');
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');await expect(game.locator('#rep-count')).toHaveText('0');
 await inGame(page,()=>{window.testMissing=false;});await expect(game.locator('#arena-title')).toHaveText('Squat down');
 for(let rep=1;rep<=5;rep++){
  await inGame(page,()=>{window.testDown=true;});await expect(game.locator('#charge-value')).toHaveText('100%');
  await page.waitForTimeout(250);
  if(rep===1)samples.push(await sample(page,'charge'));
  await inGame(page,()=>{window.testDown=false;});await expect(game.locator('#rep-count')).toHaveText(String(rep));
  if(rep===5){
   const stopped=await inGame(page,()=>({stopped:window.testStream.getTracks().every(t=>t.readyState==='ended'),terminated:window.testWorker.terminated,phase:window.motionQuest.getReplayState().phase}));
   expect(stopped).toEqual({stopped:true,terminated:true,phase:'ending'});
   await expect.poll(()=>page.evaluate(()=>window.finalSamples.length)).toBe(3);
   samples.push(...await page.evaluate(()=>window.finalSamples));
   expect(samples.slice(-3).every(s=>s.cameraOff&&s.victoryHidden)).toBe(true);
  }else await page.waitForTimeout(1850);
 }
 await expect(game.locator('#victory')).toBeVisible();
 await expect(page.locator('#local-result video')).toBeVisible({timeout:8000});
 expect(samples.map(s=>s.phase)).toEqual(['idle','charge','projectile','impact','impact']);
 expect(await page.evaluate(()=>window.recordStarts.length)).toBe(1);expect(uploads).toEqual([]);
 const decoded=await page.locator('#local-result video').evaluate(async(video,samples)=>{
  if(video.readyState<2)await new Promise(r=>video.addEventListener('loadeddata',r,{once:true}));
  video.pause();const c=document.createElement('canvas');c.width=1280;c.height=800;const ctx=c.getContext('2d');
  const frames=[];
  for(const sample of samples){
   const time=Math.max(.06,Math.min(video.duration-.1,sample.time));
   await new Promise(r=>{video.addEventListener('seeked',r,{once:true});video.currentTime=time;});ctx.drawImage(video,0,0);
   const data=ctx.getImageData(0,0,1280,800).data;
   const bright=(x0,y0,x1,y1)=>{let count=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*1280+x)*4;if(data[i]>175&&data[i+1]>175&&data[i+2]>70)count++;}return count;};
   let cyan=0;for(let y=90;y<600;y++)for(let x=200;x<1100;x++){const i=(y*1280+x)*4;if(data[i]<70&&data[i+1]>130&&data[i+2]>160)cyan++;}
   let victory=0;for(let y=110;y<180;y++)for(let x=730;x<1150;x++){const i=(y*1280+x)*4;if(data[i]>65&&data[i+1]>185&&data[i+2]>100)victory++;}
   frames.push({...sample,victory,charge:bright(480,140,780,460),spell:bright(640,210,950,370),hit:bright(800,120,1180,530),cyan,image:c.toDataURL('image/png')});
  }
  const blob=await(await fetch(video.src)).blob(),bytes=await blob.arrayBuffer(),audio=new AudioContext();
  const buffer=await audio.decodeAudioData(bytes.slice(0));
  const rms=time=>{const values=buffer.getChannelData(0),start=Math.floor(time*buffer.sampleRate),end=Math.min(values.length,start+Math.floor(.2*buffer.sampleRate));let sum=0;for(let i=start;i<end;i++)sum+=values[i]**2;return Math.sqrt(sum/(end-start));};
  const levels=samples.map(s=>({label:s.label,rms:rms(s.time)}));await audio.close();
  return {frames,levels,type:blob.type,duration:video.duration};
 },samples);
 for(const f of decoded.frames)await writeFile(info.outputPath(`decoded-${f.label}.png`),Buffer.from(f.image.split(',')[1],'base64'));
 await writeFile(info.outputPath('timings.json'),JSON.stringify({...decoded,frames:decoded.frames.map(({image,...f})=>f)},null,2));
 expect(decoded.type).toBe('video/mp4');
 expect(decoded.frames[1].charge).toBeGreaterThan(decoded.frames[0].charge+1500);
 expect(decoded.frames[2].spell).toBeGreaterThan(500);
 expect(decoded.frames[3].hit).toBeGreaterThan(1000);
 expect(decoded.frames[4].victory).toBeGreaterThan(1000);
 for(const f of decoded.frames.slice(0,5))expect(f.cyan).toBeGreaterThan(100000);
 for(const label of ['charge','projectile','impact','victory'])expect(decoded.levels.find(s=>s.label===label).rms).toBeGreaterThan(.0001);
 const pending=page.waitForEvent('download');await page.locator('#local-result a[download]').click();await(await pending).saveAs(info.outputPath('synthetic-full.mp4'));
 // The short local copy must retain the synthesized audio too.
 await page.getByRole('button',{name:'Make short share copy'}).click();
 await expect(page.locator('#local-result video')).toHaveCount(2,{timeout:30000});
 const copy=page.locator('#local-result .clip-card').nth(1);
 expect(await copy.locator('video').evaluate(async video=>{
  const context=new AudioContext(),buffer=await context.decodeAudioData(await(await fetch(video.src)).arrayBuffer());
  const values=buffer.getChannelData(0);let sum=0;for(const value of values)sum+=value*value;await context.close();return Math.sqrt(sum/values.length);
 })).toBeGreaterThan(.001);
 const copyDownload=page.waitForEvent('download');
 await copy.locator('a[download]').click();await(await copyDownload).saveAs(info.outputPath('synthetic-copy.mp4'));
 expect(await inGame(page,()=>window.motionQuest.getAudioStream().getTracks().every(t=>t.readyState==='live'))).toBe(true);
 expect(uploads).toEqual([]);
});
