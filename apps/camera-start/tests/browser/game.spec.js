import { test, expect } from '@playwright/test';
import { syntheticCamera } from './synthetic-camera.js';
const state = page => page.evaluate(()=>window.cameraSetup.getState());
async function startGame(page, button='Enable camera') {
  await page.getByRole('button',{name:button,exact:true}).click();
  if (button !== 'Resume with camera') {
    await expect(page.locator('#instruction')).toHaveText('Raise ONE hand.');
    await page.getByRole('button',{name:'Confirm & continue',exact:true}).click();
  }
  await expect.poll(async()=>(await state(page)).game.status,{timeout:6000}).toBe('running');
}

test('camera setup controls the existing Dino game: animated jump, cactus clear, collision and replay',async({page})=>{
  await syntheticCamera(page);
  // Use the taller cactus so clearance is not dependent on random obstacle height.
  await page.addInitScript(()=>{Math.random=()=>.9;});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); await page.goto('/');
  expect((await state(page)).mode).toBe('game');
  await expect(page.getByRole('slider')).toHaveCount(0);
  await expect(page.getByLabel('Skeleton debug view',{exact:true})).toBeChecked();
  await startGame(page);
  expect((await state(page)).game.score).toBeGreaterThanOrEqual(0);
  expect((await state(page)).jumpCount).toBe(0);
  expect(await page.evaluate(()=>window.testStream.getTracks().some(t=>t.readyState==='live'))).toBe(true);
  await page.evaluate(()=>{window.poseTest.rise=.03;});
  await expect.poll(async()=>(await state(page)).game.height,{intervals:[25]}).toBeGreaterThan(0);
  await page.evaluate(()=>{window.poseTest.rise=0;});
  await expect.poll(async()=>(await state(page)).jumpCount).toBe(1);
  expect((await state(page)).game.height).toBeGreaterThan(0);
  await expect.poll(async()=>(await state(page)).game.jumpAnimation.phase).toBe('grounded');
  await expect(page.locator('#instruction')).toHaveText('Jump!',{timeout:12000});
  // A short reaction to the visible cue before the synthetic body rises.
  await page.waitForTimeout(150);
  await page.evaluate(()=>{window.poseTest.rise=.08;});
  await expect.poll(async()=>(await state(page)).game.height,{intervals:[25]}).toBeGreaterThan(85); await page.evaluate(()=>{window.poseTest.rise=0;});
  await expect.poll(async()=>(await state(page)).game.passed).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/game-cleared.png'});
  await expect(page.locator('#status')).toHaveText('ROUND COMPLETE',{timeout:12000});
  expect((await state(page)).game.status).toBe('over');
  expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  await page.screenshot({path:'test-results/game-over.png'});
  await startGame(page,'Play again');
  expect((await state(page)).game.passed).toBe(0); expect((await state(page)).jumpCount).toBe(0);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Finish run',exact:true}).click();
  const logs=await page.evaluate(()=>window.cameraSetup.getLog());
  expect(logs.some(e=>e.event==='obstacle-cleared')).toBe(true);
  expect(logs.some(e=>e.event==='dino-body-returned'&&e.observedAirMs>0)).toBe(true);
  expect(logs.some(e=>e.event==='dino-jump-landed'&&e.peakHeight>0)).toBe(true);
  const arcs=logs.filter(e=>e.event==='dino-jump-landed');
  expect(arcs.length).toBeGreaterThanOrEqual(2);
  expect(arcs[1].peakHeight).toBeGreaterThan(arcs[0].peakHeight+5);
  expect(arcs[1].peakHeight).toBeLessThanOrEqual(105);
  expect(arcs[1].observedAirMs).toBeGreaterThan(arcs[0].observedAirMs);
  expect(logs.some(e=>e.event==='round-finished'&&e.reason==='collision')).toBe(true);
  for(const cue of ['jump','land','clear','crash']) expect(logs.some(e=>e.event==='audio-cue'&&e.cue===cue)).toBe(true);
  expect(errors).toEqual([]);
});

test('buttons and both-hand gestures pause and resume without scoring paused movement',async({page})=>{
  await syntheticCamera(page);await page.goto('/'); await startGame(page);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  expect((await state(page)).game.status).toBe('paused');
  const score=(await state(page)).game.score;
  await page.evaluate(()=>{window.poseTest.rise=.05;}); await page.waitForTimeout(300);
  await page.getByRole('button',{name:'Resume run',exact:true}).click();
  expect((await state(page)).game.status).toBe('paused');
  await page.evaluate(()=>{window.poseTest.rise=0;}); await page.waitForTimeout(400);
  expect((await state(page)).jumpCount).toBe(0); expect((await state(page)).game.score).toBe(score);
  await page.evaluate(()=>{window.poseTest.hand='both';});
  await expect.poll(async()=>(await state(page)).game.status,{intervals:[25]}).toBe('running');
  await page.evaluate(()=>{window.poseTest.hand='down';});
  await expect.poll(async()=>(await state(page)).gesture.latched,{intervals:[25]}).toBe(false);
  await page.evaluate(()=>{window.poseTest.hand='both';});
  await expect.poll(async()=>(await state(page)).game.status).toBe('paused');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Finish run',exact:true}).click();
  expect(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});

test('tracking loss freezes the game; camera restart rebinds controls and preserves the round',async({page})=>{
  await syntheticCamera(page);await page.goto('/'); await startGame(page);
  await page.waitForTimeout(300);
  const round=(await state(page)).game.roundId;
  // Sustained dropout holds the world without discarding the confirmed reference.
  await page.evaluate(()=>{window.poseTest.missing=true;});
  await expect.poll(async()=>(await state(page)).game.status,{intervals:[20]}).toBe('paused');
  await page.evaluate(()=>{window.poseTest.missing=false;});
  await expect.poll(async()=>(await state(page)).game.status).toBe('running');
  expect((await state(page)).heightConfirmed).toBe(true);
  await page.evaluate(()=>{window.poseTest.missing=true;});
  await expect.poll(async()=>(await state(page)).game.status).toBe('paused');
  const score=(await state(page)).game.score;
  await page.waitForTimeout(1100); expect((await state(page)).game.score).toBe(score);
  expect((await state(page)).jumpCount).toBe(0);
  expect((await state(page)).heightConfirmed).toBe(true);
  expect((await state(page)).stage).toBe('recovering');
  await page.getByRole('button',{name:'Stop camera',exact:true}).click();
  expect(await page.evaluate(()=>window.testWorker.terminated)).toBe(true);
  await page.evaluate(()=>{window.poseTest.missing=false;});
  await startGame(page,'Resume with camera');
  expect((await state(page)).game.roundId).toBe(round);
  expect((await state(page)).game.score).toBeGreaterThanOrEqual(score);
  const recoveredLog=await page.evaluate(()=>window.cameraSetup.getLog());
  expect(recoveredLog.filter(e=>e.event==='setup-completed')).toHaveLength(1);
  expect(recoveredLog.filter(e=>e.event==='countdown-started')).toHaveLength(1);
  expect(recoveredLog.some(e=>e.event==='game-baseline-recovered')).toBe(true);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  for(const [width,height] of [[390,844],[844,390],[1440,960]]) {
    await page.setViewportSize({width,height});
    await expect(page.getByRole('button',{name:'Resume run',exact:true})).toBeInViewport();
    await expect(page.locator('#movement-settings')).toBeHidden();
    await expect(page.locator('#game-stats')).toBeInViewport();
    const hud=await page.locator('#game-stats').boundingBox();
    expect(hud.y).toBeLessThan(60);expect(hud.x+hud.width).toBeGreaterThan(width*.8);
    const runway=await page.locator('#game-world').boundingBox();
    expect(runway.width).toBe(width);
    await page.screenshot({path:`test-results/compact-hud-${width}.png`});
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await expect(page.getByLabel('Skeleton debug view',{exact:true})).toBeInViewport();
    expect((await page.locator('#game-world').boundingBox()).width).toBe(runway.width);
    await page.getByRole('button',{name:'Finish run',exact:true}).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button',{name:'Finish run',exact:true})).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'Settings',exact:true})).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
    await page.screenshot({path:`test-results/game-layout-${width}.png`});
  }
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Finish run',exact:true}).click();
  for(const [width,height] of [[390,844],[844,390],[1440,960]]) {
    await page.setViewportSize({width,height});
    await expect(page.getByRole('button',{name:'Play again',exact:true})).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
    await page.screenshot({path:`test-results/game-result-${width}.png`});
  }
});


test('jump noise stays smooth; sustained loss and delayed inference recover the same round without setup',async({page})=>{
  await syntheticCamera(page);await page.goto('/');await startGame(page);
  const round=(await state(page)).game.roundId;
  await page.evaluate(()=>{window.originalTestStream=window.testStream;window.originalTestWorker=window.testWorker;window.poseTest.rise=.04;});
  await expect.poll(async()=>(await state(page)).game.height,{intervals:[20]}).toBeGreaterThan(15);
  const before=(await state(page)).game;
  await page.evaluate(()=>{window.poseTest.noiseFrames=4;});
  await expect.poll(()=>page.evaluate(()=>window.poseTest.noiseFrames),{intervals:[20]}).toBe(0);
  expect((await state(page)).game.status).toBe('running');
  expect((await state(page)).game.distance).toBeGreaterThan(before.distance);
  expect((await state(page)).game.height).toBeGreaterThan(before.height);
  await page.evaluate(()=>{window.poseTest.missing=true;});
  await expect(page.locator('#status')).toHaveText('TRACKING RECOVERING');
  const score=(await state(page)).game.score;
  await page.waitForTimeout(1200);
  const held=await state(page);
  expect(held.game.score).toBe(score);expect(held.game.height).toBe(0);
  expect(held.heightConfirmed).toBe(true);expect(held.testing).toBe(true);
  expect(held.game.roundId).toBe(round);
  await expect(page.getByRole('button',{name:'Confirm & continue',exact:true})).toBeHidden();
  // Returning while still elevated is not a landing or an automatic new jump.
  await page.evaluate(()=>{window.poseTest.missing=false;});await page.waitForTimeout(400);
  expect((await state(page)).game.status).toBe('paused');
  await page.evaluate(()=>{window.poseTest.rise=0;});
  await expect.poll(async()=>(await state(page)).game.status).toBe('running');
  expect((await state(page)).jumpCount).toBe(0);
  // A slow worker result used to tear down the camera after one second.
  await page.evaluate(()=>{window.poseTest.delay=1400;});
  await expect(page.locator('#status')).toHaveText('TRACKING RECOVERING');
  await page.waitForTimeout(1600);
  expect(await page.evaluate(()=>window.testStream===window.originalTestStream && window.testWorker===window.originalTestWorker && !window.testWorker.terminated)).toBe(true);
  await page.evaluate(()=>{window.poseTest.delay=0;});
  await expect.poll(async()=>(await state(page)).game.status,{timeout:6000}).toBe('running');
  expect((await state(page)).game.roundId).toBe(round);
  await page.evaluate(()=>{window.poseTest.rise=.04;});
  await expect.poll(async()=>(await state(page)).game.jumpAnimation.triggerCount).toBe(2);
  await page.evaluate(()=>{window.poseTest.rise=0;});
  await expect.poll(async()=>(await state(page)).jumpCount).toBe(1);
  const logs=await page.evaluate(()=>window.cameraSetup.getLog());
  expect(logs.filter(e=>e.event==='setup-completed')).toHaveLength(1);
  expect(logs.filter(e=>e.event==='countdown-started')).toHaveLength(1);
  expect(logs.filter(e=>e.event==='game-paused'&&e.reason==='tracking').length).toBe(2);
  expect(logs.some(e=>e.event==='camera-error')).toBe(false);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Finish run',exact:true}).click();
});
