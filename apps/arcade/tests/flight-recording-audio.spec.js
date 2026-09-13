import {test,expect} from '@playwright/test';

async function setup(page){
 await page.addInitScript(()=>{
  window.microphoneRequests=0;
  navigator.mediaDevices.getUserMedia=async()=>{window.microphoneRequests++;throw new Error('No device input in this synthetic test');};
  if(window!==window.top)return;
  const start=MediaRecorder.prototype.start;
  MediaRecorder.prototype.start=function(...args){window.recordStarted=performance.now();return start.apply(this,args);};
 });
 await page.goto('/play/plank-flight');
 return page.frameLocator('#game-frame');
}
async function audioLevels(video,times=[]){
 return video.evaluate(async(video,times)=>{
  const context=new AudioContext();
  try{
   const audio=await context.decodeAudioData(await(await fetch(video.src)).arrayBuffer()),samples=audio.getChannelData(0);
   const rms=(from,to)=>{const values=samples.subarray(Math.floor(from*audio.sampleRate),Math.min(samples.length,Math.floor(to*audio.sampleRate)));return Math.sqrt(values.reduce((sum,x)=>sum+x*x,0)/values.length);};
   return {whole:rms(0,audio.duration),windows:times.map(t=>rms(t,t+.3))};
  }finally{await context.close();}
 },times);
}

test('Flight replay and short copy retain game music and final speech without microphone input',async({page})=>{
 test.setTimeout(60000);
 const game=await setup(page);
 await game.getByRole('button',{name:'Try a demo'}).click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.waitForTimeout(1200);
 await game.locator('#stop').click();
 await expect.poll(()=>game.locator('#scene').evaluate(()=>window.plankFlight.getState().finished)).toBe(true);
 const finishTime=await page.evaluate(()=>(performance.now()-window.recordStarted)/1000);
 await expect(page.locator('#local-result video')).toBeVisible({timeout:15000});
 const levels=await audioLevels(page.locator('#local-result video'),[.5,finishTime+.4]);
 expect(levels.windows[0]).toBeGreaterThan(.001);
 expect(levels.windows[1]).toBeGreaterThan(.001);
 expect(await game.locator('#scene').evaluate(()=>window.plankFlight.getAudioStream().getAudioTracks()[0].readyState)).toBe('live');
 expect(await page.evaluate(()=>window.microphoneRequests)).toBe(0);
 await page.getByRole('button',{name:'Make short share copy'}).click();
 await expect(page.locator('#local-result video')).toHaveCount(2,{timeout:25000});
 expect((await audioLevels(page.locator('#local-result video').nth(1))).whole).toBeGreaterThan(.001);
});

test('Flight recording started muted captures sound when unmuted during the same round',async({page})=>{
 const game=await setup(page);
 await game.getByRole('button',{name:'Mute sound',exact:true}).click();
 await game.getByRole('button',{name:'Try a demo'}).click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.waitForTimeout(900);
 await game.getByRole('button',{name:'Enable sound',exact:true}).click();
 const unmuteTime=await page.evaluate(()=>(performance.now()-window.recordStarted)/1000);
 await page.waitForTimeout(900);
 await game.locator('#stop').click();
 await expect(page.locator('#local-result video')).toBeVisible({timeout:15000});
 const levels=await audioLevels(page.locator('#local-result video'),[.15,unmuteTime+.3]);
 expect(levels.windows[0]).toBeLessThan(.0001);
 expect(levels.windows[1]).toBeGreaterThan(.001);
});
