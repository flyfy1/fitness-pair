import {test,expect} from '@playwright/test';
import {syntheticCamera} from './synthetic-camera.js';
const state = page => page.evaluate(() => window.integAR.getState());
async function hand(page,lane,hand) {await page.evaluate(({lane,hand}) => {window.duelTest[lane].hand=hand;},{lane,hand});}
async function start(page,slug) {
  await syntheticCamera(page);
  await page.addInitScript(() => {window.duelTest=[{x:.75,hand:'down'},{x:.25,hand:'down'}];});
  await page.goto(`/?game=${slug}&mode=duel`); await page.locator('#start').click();
  await expect.poll(async () => (await state(page)).players.every(p=>p.action?.phase==='active')).toBe(true);
  await page.evaluate(() => window.duelTest.forEach(p=>p.hand='together'));
  await expect.poll(async () => (await state(page)).players.every(p=>p.start==='lower')).toBe(true);
  await page.evaluate(() => window.duelTest.forEach(p=>p.hand='down'));
  await expect(page.locator('#arena')).toHaveAttribute('data-phase','playing');
}
for(const slug of ['stack','knife','breakout'])test(`${slug}: shared countdown, isolated controls, order changes, pause and resource cleanup`,async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await start(page,slug);
  let before=await state(page);
  expect(before.players[0].sessionId).not.toBe(before.players[1].sessionId);
  await page.evaluate(() => {window.duelReverse=true;});
  if(slug==='breakout') {
    await page.evaluate(() => {window.duelTest[0].x=.68;});
    await expect.poll(async()=>(await state(page)).players[0].action.controls.horizontal).toBeGreaterThan(.2);
    expect(Math.abs((await state(page)).players[1].action.controls.horizontal)).toBeLessThan(.01);
  } else {
    await page.waitForTimeout(400); await hand(page,0,'up');
    const counter=slug==='stack'?'drops':'throws';
    await expect.poll(async()=>(await state(page)).players[0].game[counter]).toBe(1);
    expect((await state(page)).players[1].game[counter]).toBe(0);
    await page.waitForTimeout(350); expect((await state(page)).players[0].game[counter]).toBe(1);
    await hand(page,0,'down');
  }
  await page.locator('#pause').click();
  await expect(page.locator('#arena')).toHaveAttribute('data-phase','paused');
  before=await state(page); await page.waitForTimeout(400);
  expect((await state(page)).elapsed).toBe(before.elapsed);
  expect((await state(page)).players.map(p=>p.game)).toEqual(before.players.map(p=>p.game));
  await page.locator('#pause').click();await expect(page.locator('#arena')).toHaveAttribute('data-phase','playing');
  await page.evaluate(() => {window.duelTest[1].missing=true;});
  await expect(page.locator('#arena')).toHaveAttribute('data-phase','paused');
  await page.locator('#pause').click();await expect(page.locator('#arena')).toHaveAttribute('data-phase','paused');
  await page.evaluate(() => {window.duelTest[1].missing=false;window.duelTest.forEach(p=>p.hand='down');});
  await expect.poll(async()=>(await state(page)).players.every(p=>p.action?.phase==='active')).toBe(true);
  await page.locator('#pause').click();await expect(page.locator('#arena')).toHaveAttribute('data-phase','playing');
  await page.screenshot({path:info.outputPath(`${slug}-duel-desktop.png`)});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('#finish')).toBeInViewport();
  await page.screenshot({path:info.outputPath(`${slug}-duel-mobile.png`)});
  await page.locator('#finish').click();await expect(page.locator('#arena')).toHaveAttribute('data-phase','complete');
  await expect(page.locator('#instruction')).toHaveText(/wins|Draw/);
  expect(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended')&&window.testWorker.terminated)).toBe(true);
  const old=(await state(page)).round;
  await page.locator('#start').click();await expect(page.locator('#arena')).toHaveAttribute('data-phase','setup');
  expect((await state(page)).round).not.toBe(old);
  expect((await state(page)).players.every(p=>p.score===0)).toBe(true);
  await page.locator('#stop').click();expect((await state(page)).phase).toBe('idle');expect(errors).toEqual([]);
});
test('two-player entry is offered only for supported games and denial preserves retry',async({page})=>{
  await page.goto('/?game=stack');await page.locator('#duel-mode').click();await expect(page.locator('#solo-mode')).toBeVisible();
  await page.locator('#solo-mode').click();await expect(page.locator('#duel-mode')).toBeVisible();
  await page.goto('/?game=bubble');await expect(page.locator('#duel-mode')).toHaveCount(0);
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
  await page.goto('/?game=knife&mode=duel');await page.locator('#start').click();
  await expect(page.locator('#camera-error')).toContainText('permission was denied');await expect(page.locator('#start')).toBeVisible();
});
test('a full timed duel automatically finishes at 60 active seconds and releases camera resources',async({page})=>{
  test.setTimeout(80000);await start(page,'knife');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase','complete',{timeout:65000});
  const done=await state(page);expect(done.elapsed).toBeGreaterThanOrEqual(60000);expect(done.elapsed).toBeLessThan(60250);
  await expect(page.locator('#instruction')).toHaveText('Draw');
  expect(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended')&&window.testWorker.terminated)).toBe(true);
});
