import {test,expect} from '@playwright/test';
import {syntheticCamera} from '../../integ-ar/tests/synthetic-camera.js';
import {openReplay} from './open-replay.js';
test('hosted duel reuses one shared local replay and game audio without mixing player tracking sessions',async({page},info)=>{
  await syntheticCamera(page);await page.addInitScript(()=>{window.duelTest=[{x:.75,hand:'down'},{x:.25,hand:'down'}];});
  const errors=[],uploads=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['POST','PUT'].includes(r.method())&&new URL(r.url()).pathname!=='/api/play-sessions')uploads.push(r.url());});
  await page.goto('/play/ar-knife');const game=page.frameLocator('#game-frame');
  await game.locator('#duel-mode').click();await expect(game.locator('#solo-mode')).toBeVisible();
  await game.locator('#start').click();await expect(page.locator('#record-panel')).not.toHaveAttribute('data-state','recording');
  await expect.poll(()=>game.locator('body').evaluate(()=>window.integAR.getState().players.every(p=>p.action?.phase==='active'))).toBe(true);
  await game.locator('body').evaluate(()=>window.duelTest.forEach(p=>p.hand='together'));
  await expect.poll(()=>game.locator('body').evaluate(()=>window.integAR.getState().players.every(p=>p.start==='lower'))).toBe(true);
  await game.locator('body').evaluate(()=>window.duelTest.forEach(p=>p.hand='down'));
  await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
  await page.waitForTimeout(1000);await page.setViewportSize({width:390,height:844});
  await expect(game.getByRole('button',{name:'Record conversation',exact:true})).toBeInViewport();
  await expect(game.locator('#finish')).toBeInViewport();await page.screenshot({path:info.outputPath('duel-host-mobile.png')});
  await game.locator('#finish').click();await expect(page.locator('#local-result video')).toBeVisible({timeout:12000});
  const video=page.locator('#local-result video');await openReplay(video);
  const media=await video.evaluate(async v=>{
    const context=new AudioContext();try{const b=await context.decodeAudioData(await(await fetch(v.src)).arrayBuffer());const samples=b.getChannelData(0);return {energy:Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length),width:v.videoWidth,height:v.videoHeight};}finally{await context.close();}
  });
  expect(media.energy).toBeGreaterThan(.001);expect(media.width).toBeGreaterThan(0);expect(media.height).toBeGreaterThan(0);
  const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('fitness-pair-clips',1);open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{const db=open.result,read=db.transaction('clips').objectStore('clips').getAll();read.onerror=()=>reject(read.error);read.onsuccess=()=>{const clip=read.result.find(c=>c.game==='ar-knife');db.close();resolve({score:clip.finalScore,audio:clip.includesAudio,samples:clip.tracking?.samples.length});};};
  }));
  expect(saved.score).toBe('Left 0 · Right 0');expect(saved.audio).toBe(true);expect(saved.samples).toBe(0);
  expect(await game.locator('body').evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  expect(uploads).toEqual([]);expect(errors).toEqual([]);
});
