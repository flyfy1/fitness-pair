import { test, expect } from '@playwright/test';
const state = page => page.evaluate(()=>window.dinoAR.getState());
async function noCamera(page) {
  await page.addInitScript(()=>{
    window.cameraRequests=0;
    navigator.mediaDevices.getUserMedia=async()=>{window.cameraRequests++;throw new DOMException('camera not expected','NotAllowedError');};
  });
  await page.goto('/');
}

test('keyboard preview plays through jump, clear, collision and retry without opening camera or model',async({page})=>{
  await noCamera(page); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await expect(page.getByLabel('Controls',{exact:true})).toHaveValue('keyboard');
  await expect(page.locator('#input-note')).toHaveText('SIMULATED INPUT');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  expect((await state(page)).status).toBe('running');
  const source=(await state(page)).input.source;
  expect(source).toEqual({kind:'synthetic',id:'keyboard-preview'});
  await page.keyboard.press('Space');
  await expect.poll(async()=>(await state(page)).height).toBeGreaterThan(140);
  await expect.poll(async()=>(await state(page)).jumps).toBe(1);
  expect((await state(page)).height).toBe(0);
  await expect.poll(async()=>{const d=(await state(page)).nextObstacleDistance;return d!==null&&d<80&&d>5;},{timeout:12000,intervals:[20]}).toBe(true);
  await page.keyboard.press('ArrowUp');
  await expect.poll(async()=>(await state(page)).passed).toBe(1);
  await expect(page.locator('#cue')).toHaveText('Cleared!');
  await page.screenshot({path:'test-results/keyboard-clear.png'});
  await expect.poll(async()=>(await state(page)).status,{timeout:10000}).toBe('over');
  await page.keyboard.press('Space');
  await expect.poll(async()=>(await state(page)).status).toBe('running');
  expect((await state(page)).passed).toBe(0);
  expect(await page.evaluate(()=>window.cameraRequests)).toBe(0);
  expect(page.workers()).toHaveLength(0); expect(errors).toEqual([]);
});

test('jump height, pause and touch controls use the same simulated input',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await noCamera(page);
  const range=page.getByLabel('Simulated jump height'); await range.focus(); await range.press('Home');
  await expect(page.locator('#jump-range-value')).toHaveText('25%');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.getByRole('button',{name:'Jump · Space',exact:true}).click();
  await expect.poll(async()=>(await state(page)).height,{intervals:[20]}).toBeGreaterThan(30);
  expect((await state(page)).height).toBeLessThanOrEqual(41.25);
  await page.keyboard.press('KeyP');
  expect((await state(page)).status).toBe('paused');
  const paused=await state(page); await page.waitForTimeout(300);
  expect((await state(page)).height).toBe(paused.height); expect((await state(page)).score).toBe(paused.score);
  await page.keyboard.press('KeyP');
  await expect.poll(async()=>(await state(page)).jumps).toBe(1);
  await expect(page.locator('#best-height')).toHaveText('BEST LIFT 25%');
  const hud=await page.locator('footer').boundingBox();
  expect(hud.y).toBeGreaterThan((await state(page)).playfield.groundY);
  await page.screenshot({path:'test-results/keyboard-mobile.png'});
  expect(await page.evaluate(()=>window.cameraRequests)).toBe(0);
});

test('switching inputs resets the round and a rejected camera can return to keyboard play',async({page})=>{
  await noCamera(page); await page.keyboard.press('Space');
  await expect.poll(async()=>(await state(page)).status).toBe('running');
  await page.getByLabel('Controls',{exact:true}).selectOption('camera');
  expect((await state(page)).status).toBe('ready'); expect((await state(page)).input.source).toBe(null);
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect(page.locator('#detail')).toContainText('Camera permission denied');
  await page.getByLabel('Controls',{exact:true}).selectOption('keyboard');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  expect((await state(page)).status).toBe('running');
  expect((await state(page)).input.source.kind).toBe('synthetic');
  expect((await state(page)).jumps).toBe(0); expect(page.workers()).toHaveLength(0);
});
