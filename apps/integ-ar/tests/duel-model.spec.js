import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
test('real two-pose local model assigns two copies of a public image to separate lanes',async({page,request},info)=>{
  test.setTimeout(50000);
  let bytes;
  try {bytes=await readFile('tests/.cache/pose.jpg');}
  catch {const response=await request.get('https://storage.googleapis.com/mediapipe-assets/pose.jpg');expect(response.ok()).toBe(true);bytes=await response.body();await mkdir('tests/.cache',{recursive:true});await writeFile('tests/.cache/pose.jpg',bytes);}
  await page.addInitScript(dataURL=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const image=new Image();image.src=dataURL;await image.decode();
      // Two duplicate public-fixture images test model plumbing, not two humans.
      const canvas=document.createElement('canvas');canvas.width=image.width*2;canvas.height=image.height;
      const ctx=canvas.getContext('2d'),draw=()=>{ctx.drawImage(image,0,0);ctx.drawImage(image,image.width,0);};draw();
      const stream=canvas.captureStream(15);window.publicFixtureStream=stream;
      const timer=setInterval(()=>stream.getTracks().every(t=>t.readyState==='ended')?clearInterval(timer):draw(),66);return stream;
    };
  },`data:image/jpeg;base64,${bytes.toString('base64')}`);
  const external=[];page.on('request',r=>{if(!r.url().startsWith('data:')&&new URL(r.url()).origin!=='http://127.0.0.1:5285')external.push(r.url());});
  await page.goto('/?game=breakout&mode=duel');await page.locator('#start').click();
  await expect.poll(()=>page.evaluate(()=>window.integAR.getState().players.map(p=>!!p.pose?.joints.leftShoulder)),{timeout:35000}).toEqual([true,true]);
  const players=await page.evaluate(()=>window.integAR.getState().players);
  expect(players[0].pose.joints.leftShoulder.x).toBeGreaterThan(.5);expect(players[1].pose.joints.leftShoulder.x).toBeLessThan(.5);
  expect(players[0].pose.sessionId).not.toBe(players[1].pose.sessionId);
  expect(players[0].pose.tMs).toBe(players[1].pose.tMs);
  await page.screenshot({path:info.outputPath('duel-public-fixture.png')});
  await page.locator('#stop').click();expect(await page.evaluate(()=>window.publicFixtureStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  await expect.poll(()=>page.workers().length).toBe(0);expect(external).toEqual([]);
});
