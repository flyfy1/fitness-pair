import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

async function movingCamera(page,{neverReady=false}={}){
 await page.addInitScript(({neverReady})=>{
  if(window===window.top)return;
  navigator.mediaDevices.getUserMedia=async()=>{
   window.cameraRequests=(window.cameraRequests||0)+1;
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
   const ctx=canvas.getContext('2d'),stream=canvas.captureStream(24);window.testStream=stream;
   const begin=performance.now();
   const paint=()=>{
    ctx.fillStyle='#20b0cc';ctx.fillRect(0,0,640,480);
    ctx.fillStyle='#ff00ff';ctx.fillRect(70,150,20,20);
    ctx.fillStyle='#00ff00';ctx.fillRect(0,0,640,10);
    const x=240+90*Math.sin((performance.now()-begin)/550),y=100+25*Math.sin((performance.now()-begin)/350);
    ctx.fillStyle='#fa2030';ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();
    ctx.fillRect(x-25,y+34,50,100);ctx.fillRect(x-60,y+45,120,20);
    ctx.fillRect(x-25,y+125,18,95);ctx.fillRect(x+7,y+125,18,95);
    ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText('SYNTHETIC MOVING PERSON · NO PARTICIPANT',15,455);
   };
   paint();const timer=setInterval(()=>{if(stream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer);else paint();},40);
   return stream;
  };
  window.Worker=class{
   constructor(){this.frame=0;window.testWorker=this;}
   postMessage(data){
    if(data.type==='init'){if(!neverReady)setTimeout(()=>this.onmessage({data:{type:'ready'}}),0);return;}
    data.bitmap.close();const frame=this.frame++,down=frame>=40&&(frame-40)%24<12;
    const points=Array.from({length:33},()=>({x:.5,y:.3,visibility:1}));
    for(const ids of [[11,23,25,27],[12,24,26,28]]){
     points[ids[0]].y=down?.28:.2;points[ids[1]].y=down?.53:.45;
     points[ids[2]].y=.65;points[ids[2]].x=down?.68:.5;points[ids[3]].y=.9;
    }
    setTimeout(()=>{if(!this.terminated)this.onmessage({data:{type:'pose',landmarks:points,time:data.time,inferenceMs:1}});},0);
   }
   terminate(){this.terminated=true;}
  };
 },{neverReady});
}

test('actual Motion Quest camera path exports moving person, game, HUD and branding in genuine MP4',async({page},info)=>{
 await movingCamera(page);const uploads=[];page.on('request',r=>{if(r.method()==='PUT')uploads.push(r.url());});
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await expect(page.locator('#record-status')).toContainText('game + camera');
 await expect(game.locator('#rep-count')).toHaveText('5',{timeout:25000});
 await expect(page.locator('#local-result video')).toBeVisible({timeout:10000});
 await expect(page.locator('#local-result')).toContainText('Player recording');
 const camera=await page.evaluate(()=>{const w=document.querySelector('#game-frame').contentWindow;return {requests:w.cameraRequests,stopped:w.testStream.getTracks().every(t=>t.readyState==='ended'),terminated:w.testWorker.terminated};});
 expect(camera).toEqual({requests:1,stopped:true,terminated:true});expect(uploads).toEqual([]);
 const results=await page.locator('#local-result video').evaluate(async video=>{
  video.pause();const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=800;const c=canvas.getContext('2d');const frames=[];
  for(const time of [.4,2.0,3.4,video.duration-3.5,video.duration-.3]){
   await new Promise(resolve=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=time;});c.drawImage(video,0,0);
   const data=c.getImageData(0,0,1280,800).data;let red=0,redX=0,cyan=0,game=0,brand=0,hud=0,marker=0,markerX=0,cropped=0;
   for(let y=0;y<800;y++)for(let x=0;x<1280;x++){
    const i=(y*1280+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    if(y<720&&r<20&&g>240&&b<20)cropped++;
    if(y>80&&y<630&&r>230&&g<30&&b>230){marker++;markerX+=x;}
    if(y>80&&y<630&&r>210&&g<80&&b<100){red++;redX+=x;}
    if(y>80&&y<630&&r<70&&g>130&&b>160)cyan++;
    if(x>820&&x<1050&&y>150&&y<430&&g>r*1.1&&g>b*1.1)game++;
    if(y>735&&x<240&&b>150&&r<100)brand++;
    if(y>20&&y<65&&r>210&&g>210&&b>210)hud++;
   }
   frames.push({time,red,redX:redX/red,cyan,game,brand,hud,marker,markerX:markerX/marker,cropped,image:canvas.toDataURL('image/png')});
  }
  const blob=await (await fetch(video.src)).blob();return {type:blob.type,signature:[...new Uint8Array(await blob.slice(4,8).arrayBuffer())],frames};
 });
 for(const [i,frame] of results.frames.entries())await writeFile(info.outputPath(`decoded-camera-${i}.png`),Buffer.from(frame.image.split(',')[1],'base64'));
 expect(results.type).toBe('video/mp4');expect(results.signature).toEqual([102,116,121,112]);
 for(const frame of results.frames.slice(0,4)){expect(frame.red).toBeGreaterThan(8000);expect(frame.cyan).toBeGreaterThan(100000);expect(frame.brand).toBeGreaterThan(300);expect(frame.hud).toBeGreaterThan(100);expect(frame.marker).toBeGreaterThan(500);expect(frame.markerX).toBeGreaterThan(1000);expect(frame.markerX).toBeLessThan(1055);expect(frame.cropped).toBeLessThan(10);}
 expect(Math.abs(results.frames[0].redX-results.frames[1].redX)).toBeGreaterThan(60);
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
