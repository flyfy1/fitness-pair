import {openReplay} from './open-replay.js';
import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

import {movingCamera} from './moving-camera.js';
import {readStoredClip} from './read-stored-clip.js';

test('actual Motion Quest camera path exports moving person, game, HUD without promotional branding in genuine MP4',async({page},info)=>{
 await movingCamera(page);const uploads=[];page.on('request',r=>{if(r.method()==='PUT')uploads.push(r.url());});
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#record-status')).toContainText('game + camera');
 await expect(game.locator('#rep-count')).toHaveText('5',{timeout:25000});
 await expect(page.locator('#local-result video')).toBeVisible({timeout:10000});
 await expect(page.locator('#local-result')).toContainText('Player recording');
 const stored=await readStoredClip(page,'motion-quest');
 expect(stored.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 expect(stored.tracking).toMatchObject({format:'fitness-pair/tracking-session/1',sessionId:stored.sessionId,source:stored.inputSource});
 expect(stored.tracking.sampleCount).toBeGreaterThan(0);expect(stored.tracking.sampleSessionIds).toEqual([stored.sessionId]);
 const camera=await page.evaluate(()=>{const w=document.querySelector('#game-frame').contentWindow;return {requests:w.cameraRequests,stopped:w.testStream.getTracks().every(t=>t.readyState==='ended'),terminated:w.testWorker.terminated};});
 expect(camera).toEqual({requests:1,stopped:true,terminated:true});expect(uploads).toEqual([]);
 await openReplay(page.locator('#local-result video'));
 const results=await page.locator('#local-result video').evaluate(async video=>{
  video.pause();const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=800;const c=canvas.getContext('2d');const frames=[];
  for(const time of [.4,2.0,3.4,video.duration-.3]){
   await new Promise(resolve=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=time;});c.drawImage(video,0,0);
   const data=c.getImageData(0,0,1280,800).data;let red=0,redX=0,cyan=0,game=0,brand=0,hud=0,marker=0,markerX=0,cropped=0;
   for(let y=0;y<800;y++)for(let x=0;x<1280;x++){
    const i=(y*1280+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    if(y<720&&r<20&&g>240&&b<20)cropped++;
    if(y>80&&y<630&&r>230&&g<30&&b>230){marker++;markerX+=x;}
    if(y>80&&y<630&&r>210&&g<80&&b<100){red++;redX+=x;}
    if(y>80&&y<630&&r<70&&g>130&&b>160)cyan++;
    if(x>820&&x<1050&&y>150&&y<430&&g>r*1.1&&g>b*1.1)game++;
    if(y>735&&x<240&&r>200&&g>200&&b<100)brand++;
    if(y>20&&y<65&&r>210&&g>210&&b>210)hud++;
   }
   frames.push({time,red,redX:redX/red,cyan,game,brand,hud,marker,markerX:markerX/marker,cropped,image:canvas.toDataURL('image/png')});
  }
  const blob=await (await fetch(video.src)).blob();return {type:blob.type,signature:[...new Uint8Array(await blob.slice(4,8).arrayBuffer())],frames};
 });
 for(const [i,frame] of results.frames.entries())await writeFile(info.outputPath(`decoded-camera-${i}.png`),Buffer.from(frame.image.split(',')[1],'base64'));
 expect(results.type).toBe('video/mp4');expect(results.signature).toEqual([102,116,121,112]);
 for(const frame of results.frames.slice(0,4)){expect(frame.red).toBeGreaterThan(8000);expect(frame.cyan).toBeGreaterThan(100000);expect(frame.brand).toBeLessThan(300);expect(frame.hud).toBeGreaterThan(100);expect(frame.marker).toBeGreaterThan(500);expect(frame.markerX).toBeGreaterThan(1000);expect(frame.markerX).toBeLessThan(1200);expect(frame.cropped).toBeLessThan(10);}
 expect(Math.max(...results.frames.map(frame=>frame.redX))-Math.min(...results.frames.map(frame=>frame.redX))).toBeGreaterThan(60);
 expect(results.frames[0].game).toBeGreaterThan(100);
});

test('waiting for the camera model never starts a canvas-only camera replay',async({page})=>{
 await movingCamera(page,{neverReady:true});await page.goto('/play/motion-quest');await page.frameLocator('#game-frame').locator('#start').click();
 await expect(page.frameLocator('#game-frame').locator('#start')).toContainText('Loading');await page.waitForTimeout(900);
 await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');await expect(page.locator('#local-result video')).toHaveCount(0);
 await page.frameLocator('#game-frame').locator('#stop').click();await expect(page.locator('#local-result video')).toHaveCount(0);
});

test('camera loss ends a labeled partial camera replay without starting synthetic capture',async({page})=>{
 await movingCamera(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');await game.locator('#start').click();
 await expect(page.locator('#record-status')).toContainText('game + camera');await page.waitForTimeout(600);await game.locator('#stop').click();
 await expect(page.locator('#local-result video')).toBeVisible({timeout:7000});await expect(page.locator('#record-status')).toContainText('Camera interrupted');
 await expect(page.locator('#local-result')).toContainText('Player recording');await page.waitForTimeout(600);await expect(page.locator('#local-result video')).toHaveCount(1);
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','idle');
});
