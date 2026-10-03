import {test,expect} from '@playwright/test';
import {syntheticCamera} from '../../../experiments/gameplay/plank-flight/tests/browser/synthetic-camera.js';
import {readStoredClip} from './read-stored-clip.js';
import {openReplay} from './open-replay.js';

test('head-tracking grace and recovery keep one camera replay and audible final encouragement',async({page},info)=>{
 await syntheticCamera(page);const errors=[],uploads=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(['POST','PUT'].includes(request.method())&&new URL(request.url()).pathname!=='/api/play-sessions')uploads.push(request.url());});
 await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
 const state=()=>game.locator('body').evaluate(()=>window.plankFlight.getState());
 await game.locator('#start').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 const original=await state();
 await game.locator('body').evaluate(()=>window.testMissing=true);await page.waitForTimeout(700);
 expect((await state()).status).toBe('flying');
 await expect.poll(async()=>(await state()).status).toBe('paused');
 const frozen=(await state()).flightSeconds;await page.waitForTimeout(1000);
 expect((await state()).flightSeconds).toBe(frozen);
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.setViewportSize({width:390,height:844});
 await expect(game.locator('#stop')).toBeInViewport();await expect(game.locator('#cue')).toBeInViewport();
 await page.screenshot({path:info.outputPath('flight-recovery-mobile.png')});
 await game.locator('body').evaluate(()=>window.testMissing=false);
 await expect.poll(async()=>(await state()).status).toBe('flying');
 expect((await state()).sessionId).toBe(original.sessionId);
 await expect.poll(async()=>(await state()).audio.playing).toBe(true);
 // Finish during another tracking pause: the same recorder retains the ending.
 await game.locator('body').evaluate(()=>window.testMissing=true);await expect.poll(async()=>(await state()).status).toBe('paused');
 await game.locator('#stop').click();await expect(page.locator('#local-result video')).toHaveCount(1,{timeout:12000});
 const clip=await readStoredClip(page,'plank-flight');expect(clip.sessionId).toBe(original.sessionId);
 expect(clip.tracking.sampleSessionIds).toEqual([original.sessionId]);
 expect((await state()).audio.lastEncouragement?.id).toMatch(/-end$/);
 await openReplay(page.locator('#local-result video'));
 const audio=await page.locator('#local-result video').evaluate(async video=>{
  const context=new AudioContext();try{
   const buffer=await context.decodeAudioData(await(await fetch(video.src)).arrayBuffer()),samples=buffer.getChannelData(0);
   const end=samples.subarray(Math.max(0,samples.length-Math.ceil(buffer.sampleRate*1.6)));
   return {duration:buffer.duration,endingRms:Math.sqrt(end.reduce((sum,v)=>sum+v*v,0)/end.length)};
  }finally{await context.close();}
 });
 expect(audio.duration).toBeGreaterThan(frozen+3);expect(audio.endingRms).toBeGreaterThan(.003);
 expect(await game.locator('body').evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
 expect(errors).toEqual([]);expect(uploads).toEqual([]);
});
