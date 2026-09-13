import { test, expect } from '@playwright/test';
import { syntheticCamera, confirmWithHand } from './synthetic-camera.js';
const state = page => page.evaluate(() => window.cameraSetup.getState());
async function ready(page) {
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect(page.locator('#instruction')).toHaveText('Raise your LEFT hand.');
}
async function analyser(page) {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createDynamicsCompressor() {
        const node=super.createDynamicsCompressor(),connect=node.connect.bind(node);
        node.connect=target=>{
          const a=this.createAnalyser();a.fftSize=1024;connect(a);a.connect(target);
          window.testAudioAnalyser=a;return target;
        };
        return node;
      }
    };
  });
}
const level = page => page.evaluate(() => {
  const a=window.testAudioAnalyser;if(!a)return 0;
  const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);
  return Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);
});

test('real local countdown speech and rhythmic audio follow countdown, pause, mute and finish',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await analyser(page);await syntheticCamera(page);await page.goto('/');
  expect((await state(page)).audio.state).toBe('idle');
  await ready(page);
  await expect.poll(async()=>(await state(page)).audio.voicesReady).toBe(7);
  await confirmWithHand(page);
  for(const [label,cue] of [['3','three'],['2','two'],['1','one']]) {
    await expect(page.locator('#instruction')).toHaveText(label);
    await expect.poll(async()=>(await state(page)).audio.lastCue).toBe(cue);
  }
  await expect.poll(async()=>(await state(page)).audio.lastCue).toBe('start');
  await expect.poll(()=>level(page)).toBeGreaterThan(.002);
  await expect.poll(async()=>(await state(page)).audio.beat).toBeGreaterThan(2);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await expect.poll(async()=>(await state(page)).audio.state).toBe('suspended');
  expect((await state(page)).audio.activeNodes).toBe(0);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Game sound',{exact:true}).uncheck();
  await page.getByLabel('Game sound',{exact:true}).check();
  await page.waitForTimeout(150);
  expect((await state(page)).audio.state).toBe('suspended');
  expect((await state(page)).audio.activeNodes).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Resume run',exact:true}).click();
  await expect.poll(()=>level(page)).toBeGreaterThan(.002);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Game sound',{exact:true}).uncheck();
  await expect.poll(async()=>(await state(page)).audio.state).toBe('suspended');
  expect((await state(page)).audio.activeNodes).toBe(0);
  await page.getByLabel('Game sound',{exact:true}).check();
  await expect.poll(()=>level(page)).toBeGreaterThan(.002);
  await page.getByRole('button',{name:'Finish run',exact:true}).click();
  await expect.poll(async()=>(await state(page)).audio.lastCue).toBe('finish');
  await expect.poll(async()=>(await state(page)).audio.state).toBe('suspended');
  expect((await state(page)).audio.activeNodes).toBe(0);
  const cues=await page.evaluate(()=>window.cameraSetup.getLog().filter(e=>e.event==='audio-cue').map(e=>e.cue));
  expect(cues.slice(0,4)).toEqual(['three','two','one','start']);
  expect(errors).toEqual([]);
});

test('cancelled countdown cannot play a late-loaded voice or start background music',async({page})=>{
  await syntheticCamera(page);
  await page.route('**/audio/*.wav',async route=>{
    const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,3000));
    await route.fulfill({response});
  });
  await page.goto('/');await ready(page);
  await confirmWithHand(page);
  await expect(page.locator('#instruction')).toHaveText('3');
  await page.getByRole('button',{name:'Stop camera',exact:true}).click();
  await page.waitForTimeout(3200);
  const s=await state(page);
  expect(s.audio.voicesReady).toBe(7);expect(s.audio.state).toBe('suspended');
  expect(s.audio.activeNodes).toBe(0);expect(s.game.status).toBe('ready');
  expect(await page.evaluate(()=>window.cameraSetup.getLog().some(e=>e.event==='audio-cue'&&e.cue==='start'))).toBe(false);
});

test('unavailable Web Audio does not block the camera game',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});
  await syntheticCamera(page);await page.goto('/');await ready(page);
  await confirmWithHand(page);
  await expect.poll(async()=>(await state(page)).game.status,{timeout:6000}).toBe('running');
  expect((await state(page)).audio.unavailable).toBe(true);
  await page.getByRole('button',{name:'Stop camera',exact:true}).click();
  expect(errors).toEqual([]);
});

test('hidden-page and page-exit lifecycle events release owned audio',async({page})=>{
  await syntheticCamera(page);await page.goto('/');await ready(page);
  await confirmWithHand(page);
  await expect.poll(async()=>(await state(page)).audio.phase,{timeout:6000}).toBe('running');
  await expect.poll(async()=>(await state(page)).audio.activeNodes).toBeGreaterThan(0);
  // Synthetic lifecycle delivery checks cleanup, independently of camera accuracy.
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async()=>(await state(page)).audio.state).toBe('suspended');
  expect((await state(page)).audio.activeNodes).toBe(0);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(async()=>(await state(page)).audio.state).toBe('closed');
  expect((await state(page)).audio.activeNodes).toBe(0);
});
