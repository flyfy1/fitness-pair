import {test,expect} from '@playwright/test';
import {syntheticCamera} from './synthetic-camera.js';
const state=page=>page.evaluate(()=>window.integAR.getState());
const move=(page,value)=>page.evaluate(value=>Object.assign(window.poseTest,value),value);
const step=(page,value)=>expect(page.locator('#tutorial')).toHaveAttribute('data-step',value);
async function practice(page){await syntheticCamera(page);await page.goto('/?game=invaders');await page.locator('#tutorial-start').click();await step(page,'left');}
test('large tutorial requires real recognized practice and keeps game physics stopped',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await practice(page);const frozen=(await state(page)).game;
 expect(await page.evaluate(()=>window.gameplay.getFrame().phase)).toBe('setup');
 await page.screenshot({path:info.outputPath('practice-desktop.png')});
 await move(page,{x:-.08,hand:'up'});await page.waitForTimeout(450);await step(page,'left');
 await move(page,{x:.08,hand:'down'});await step(page,'right');
 await move(page,{x:-.08});await step(page,'fire');
 await move(page,{hand:'both'});await page.waitForTimeout(1100);await step(page,'fire');
 await move(page,{hand:'down',x:0});await page.waitForTimeout(450);await move(page,{hand:'up'});await step(page,'lower');
 await page.waitForTimeout(450);await step(page,'lower');await expect(page.locator('#tutorial-play')).toBeHidden();
 await move(page,{hand:'down'});await step(page,'ready');expect((await state(page)).game).toEqual(frozen);
 await page.locator('#tutorial-play').click();await expect.poll(async()=>(await state(page)).phase).toBe('playing');
 expect((await state(page)).game.shotsFired).toBe(0);await page.waitForTimeout(350);await move(page,{hand:'up'});await expect.poll(async()=>(await state(page)).game.shotsFired).toBe(1);
 await page.locator('#finish').click();expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);expect(errors).toEqual([]);
});
test('skip before permission opens normal calibration and never opens the camera itself',async({page},info)=>{
 await syntheticCamera(page);await page.goto('/?game=invaders');await expect(page.locator('#tutorial')).toBeVisible();expect(await page.evaluate(()=>!!window.testStream)).toBe(false);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('intro-mobile.png')});
 await page.locator('#tutorial-skip').click();expect(await page.evaluate(()=>!!window.testStream)).toBe(false);await expect(page.locator('#start')).toBeVisible();await page.locator('#start').click();await expect.poll(async()=>(await state(page)).phase).toBe('playing');await page.locator('#finish').click();
});
test('missing tracking cannot advance practice; mid-practice skip still waits for tracking',async({page})=>{
 await practice(page);await move(page,{missing:true,x:.08});await page.waitForTimeout(500);await step(page,'left');await expect(page.locator('#tutorial-feedback')).toContainText(/tracking|show|view/i);
 await page.locator('#tutorial-skip').click();await page.waitForTimeout(500);expect((await state(page)).phase).toBe('setup');
 await move(page,{missing:false,x:0});await expect.poll(async()=>(await state(page)).phase).toBe('playing');await page.locator('#finish').click();
});
test('practice cancellation releases the camera and resets the next attempt',async({page})=>{
 await practice(page);await move(page,{x:.08});await step(page,'right');await page.locator('#tutorial-cancel').click();await step(page,'intro');expect(await page.evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
 await move(page,{x:0});await page.locator('#tutorial-start').click();await step(page,'left');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await step(page,'intro');expect((await state(page)).camera).toBe(false);
});
test('permission denial has a readable retry and skip',async({page})=>{
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});await page.goto('/?game=invaders');await page.locator('#tutorial-start').click();await expect(page.locator('#tutorial-feedback')).toContainText('denied');await expect(page.locator('#tutorial-start')).toBeVisible();await expect(page.locator('#tutorial-skip')).toBeVisible();
});
test('cancelling the permission prompt stops a camera stream that arrives later',async({page})=>{
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.grantLater=()=>{const c=document.createElement('canvas');c.width=c.height=32;window.lateStream=c.captureStream(0);resolve(window.lateStream);};});});
 await page.goto('/?game=invaders');await page.locator('#tutorial-start').click();await expect(page.locator('#tutorial-cancel')).toBeVisible();await page.locator('#tutorial-cancel').click();await page.evaluate(()=>window.grantLater());
 await expect.poll(()=>page.evaluate(()=>window.lateStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);await step(page,'intro');
});
