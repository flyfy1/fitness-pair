import {test,expect} from '@playwright/test';
import {syntheticCamera} from './synthetic-camera.js';
const state=page=>page.evaluate(()=>window.plankFlight.getState());
const pose=(page,value)=>page.evaluate(value=>{
 Object.assign(window,value);
},value);
const world=s=>Object.fromEntries(['countdownSeconds','flightSeconds','speedGain','passed','spawned','obstacles','collisionSeconds','x','y'].map(key=>[key,s[key]]));
async function start(page){
 await syntheticCamera(page);await page.goto('/');await page.locator('#start').click();
 await expect.poll(async()=>(await state(page)).status).toBe('flying');
 await page.evaluate(()=>{window.originalWorker=window.testWorker;window.originalStream=window.testStream;window.originalAudio=window.plankFlight.getAudioStream();});
}

test('long head loss freezes the world and sound, then fresh tracking resumes the same flight and audio stream',async({page})=>{
 await start(page);const original=await state(page);await pose(page,{testMissing:true});
 await page.waitForTimeout(700);expect((await state(page)).status).toBe('flying');
 expect((await state(page)).flightSeconds).toBeGreaterThan(original.flightSeconds+.4);
 await expect.poll(async()=>(await state(page)).status).toBe('paused');
 await expect(page.locator('#cue')).toContainText('head and either shoulder');
 await expect.poll(async()=>(await state(page)).audio.state).toBe('suspended');
 const frozen=world(await state(page));await page.waitForTimeout(2300);expect(world(await state(page))).toEqual(frozen);
 expect((await state(page)).cameraActive).toBe(true);expect((await state(page)).trackingPausedFrom).toBe('flying');
 await pose(page,{testMissing:false});await expect.poll(async()=>(await state(page)).status).toBe('flying');
 await expect.poll(async()=>(await state(page)).audio.playing).toBe(true);
 expect((await state(page)).sessionId).toBe(original.sessionId);
 expect(await page.evaluate(()=>window.testWorker===window.originalWorker&&window.testStream===window.originalStream&&window.plankFlight.getAudioStream()===window.originalAudio)).toBe(true);
 await page.locator('#stop').click();
 expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});

test('long loss during countdown freezes its remaining time and resumes without a new countdown',async({page})=>{
 await syntheticCamera(page);await page.goto('/');await page.locator('#start').click();
 await expect(page.locator('#countdown')).toHaveText('3');const original=await state(page);
 await pose(page,{testMissing:true});await expect.poll(async()=>(await state(page)).status).toBe('paused');
 const frozen=world(await state(page));expect((await state(page)).trackingPausedFrom).toBe('countdown');
 await page.waitForTimeout(1000);expect(world(await state(page))).toEqual(frozen);
 expect((await state(page)).flightSeconds).toBe(0);expect((await state(page)).obstacles).toEqual([]);
 await pose(page,{testMissing:false});await expect.poll(async()=>(await state(page)).status).toBe('countdown');
 expect((await state(page)).countdownSeconds).toBeGreaterThanOrEqual(frozen.countdownSeconds);
 expect((await state(page)).countdownSeconds).toBeLessThan(2.6);
 await expect.poll(async()=>(await state(page)).status).toBe('flying');expect((await state(page)).sessionId).toBe(original.sessionId);
});

test('Finish & rest works while tracking is paused and retains final encouragement',async({page})=>{
 await start(page);await pose(page,{testMissing:true});await expect.poll(async()=>(await state(page)).status).toBe('paused');
 await page.locator('#stop').click();await expect.poll(async()=>(await state(page)).status).toBe('crashing');
 expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
 await expect(page.locator('#title')).toHaveText('You did so well.');
 expect((await state(page)).reason).toBe('rest');expect((await state(page)).audio.lastCue).toBe('finish');
});

test('terminal inference failure freezes play, releases resources and requires an explicit fresh start',async({page})=>{
 await start(page);const original=await state(page);await pose(page,{testDelay:4000});
 await expect(page.locator('#start')).toHaveText('Start a fresh flight');
 expect((await state(page)).status).toBe('paused');expect((await state(page)).cameraActive).toBe(false);
 expect((await state(page)).trackingPausedFrom).toBe(null);
 expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
 const frozen=world(await state(page));await pose(page,{testDelay:0});await page.waitForTimeout(1000);expect(world(await state(page))).toEqual(frozen);
 await page.locator('#start').click();await expect.poll(async()=>(await state(page)).status).toBe('flying');
 expect((await state(page)).sessionId).not.toBe(original.sessionId);
});

test('backgrounding cancels recovery rather than restarting the camera',async({page})=>{
 await start(page);await pose(page,{testMissing:true});await expect.poll(async()=>(await state(page)).status).toBe('paused');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await pose(page,{testMissing:false});await page.waitForTimeout(1000);
 expect((await state(page)).status).toBe('paused');expect((await state(page)).trackingPausedFrom).toBe(null);
 expect((await state(page)).cameraActive).toBe(false);
 expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});

test('sporadic head detections cannot postpone the pause while control remains unavailable',async({page})=>{
 await start(page);const initial=await state(page);await pose(page,{testMissing:true});
 for(let i=0;i<4;i++){
  await page.waitForTimeout(400);await pose(page,{testMissing:false});
  await page.waitForTimeout(100);await pose(page,{testMissing:true});
 }
 expect((await state(page)).status).toBe('paused');
 expect((await state(page)).flightSeconds).toBeLessThan(initial.flightSeconds+1.7);
 await pose(page,{testMissing:false});await expect.poll(async()=>(await state(page)).status).toBe('flying');
 expect((await state(page)).sessionId).toBe(initial.sessionId);
});
