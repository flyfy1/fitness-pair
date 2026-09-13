import {openReplay} from './open-replay.js';
import {test,expect} from '@playwright/test';
import pack from '../../../experiments/gameplay/plank-flight/resources/encouragement.json' with {type:'json'};

test('all GPT speech and music resources decode from the mounted game',async({page})=>{
 await page.goto('/play/plank-flight');
 await page.setViewportSize({width:844,height:390});
 await expect(page.frameLocator('#game-frame').getByText('AI-generated voices',{exact:true})).toBeInViewport();
 const levels=await page.evaluate(async pack=>{
  const audio=new AudioContext(),results=[];
  try{
   const files=[...[...pack.clips,...pack.cues].flatMap(x=>Object.values(x.variants).map(variant=>variant.file)),...pack.styles.map(x=>`music-${x.id}.wav`)];
   for(const file of files){
    const response=await fetch(`/games/plank-flight/audio/encouragement/${file}`);
    if(!response.ok)throw new Error(`Missing resource: ${file}`);
    const buffer=await audio.decodeAudioData(await response.arrayBuffer());
    const data=buffer.getChannelData(0),rms=Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length);
    results.push({file,duration:buffer.duration,rms});
   }
  }finally{await audio.close();}
  return results;
 },pack);
 expect(levels).toHaveLength(50);
 for(const level of levels){expect(level.rms,level.file).toBeGreaterThan(.005);expect(level.duration).toBeLessThan(9);}
});

test('completed gate groups trigger spaced varied encouragement and retain randomized ending in replay',async({page})=>{
 test.setTimeout(75000);
 const external=[];page.on('request',r=>{if(r.url().startsWith('https://api.openai.com')||r.method()==='PUT')external.push(r.url());});
 await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
 await expect(game.getByText('AI-generated voices',{exact:true})).toBeVisible();
 await game.getByRole('button',{name:'Try a demo'}).click();
 await expect.poll(()=>game.locator('#scene').evaluate(()=>window.plankFlight.getState().audio.encouragementReady)).toBe(18);
 await game.locator('#scene').evaluate(()=>{
  window.observedEncouragement=[];let last=null;
  window.testAutopilot=setInterval(()=>{
   const state=window.plankFlight.getState(),scene=document.querySelector('.stage'),rect=scene.getBoundingClientRect();
   const next=state.obstacles.find(x=>!x.counted);
   scene.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+rect.width*.35,clientY:rect.top+rect.height*(next?.gap??.5),bubbles:true}));
   const clip=state.audio.lastEncouragement;
   if(clip&&clip.id!==last){window.observedEncouragement.push({...clip,passed:state.passed,time:state.flightSeconds});last=clip.id;}
  },30);
 });
 await expect.poll(()=>game.locator('#scene').evaluate(()=>window.observedEncouragement.length),{timeout:44000}).toBeGreaterThanOrEqual(2);
 const heard=await game.locator('#scene').evaluate(()=>{clearInterval(window.testAutopilot);return window.observedEncouragement;});
 expect(heard[0].passed).toBeGreaterThanOrEqual(2);expect(heard[0].time).toBeGreaterThanOrEqual(12);
 expect(heard[1].time-heard[0].time).toBeGreaterThanOrEqual(12);expect(heard[0].id).not.toBe(heard[1].id);
 await game.getByRole('button',{name:'Finish & rest'}).click();
 await expect.poll(()=>game.locator('#scene').evaluate(()=>window.plankFlight.getState().audio.lastEncouragement?.id)).toMatch(/-end$/);
 await expect(page.locator('#local-result video')).toBeVisible({timeout:16000});
 await openReplay(page.locator('#local-result video'));
 const recorded=await page.locator('#local-result video').evaluate(async video=>{
  const audio=new AudioContext();try{
   const data=await audio.decodeAudioData(await(await fetch(video.src)).arrayBuffer()),samples=data.getChannelData(0);
   return {duration:data.duration,rms:Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length)};
  }finally{await audio.close();}
 });
 expect(recorded.duration).toBeGreaterThan(heard[1].time);expect(recorded.rms).toBeGreaterThan(.005);
 expect(external).toEqual([]);
});


test.describe('Chinese voices and interface',()=>{
 test.use({locale:'zh-CN'});
 test('Chinese controls fit narrow screens',async({page},info)=>{
  for(const width of [390,320]){
   await page.setViewportSize({width,height:740});await page.goto('/play/plank-flight');
   const game=page.frameLocator('#game-frame');await game.locator('#language').selectOption('zh');
   for(const selector of ['#start','#demo','#language','#sound','#fullscreen'])await expect(game.locator(selector)).toBeInViewport();
   expect(await game.locator('html').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:info.outputPath(`chinese-${width}.png`)});
  }
 });
 test('initial language choices persist while setup controls stay hidden during the round',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
  await expect(game.locator('#language')).toHaveValue('zh');
  await expect(game.getByRole('button',{name:'开启摄像头',exact:true})).toBeVisible();
  await game.locator('#language').selectOption('zh');await page.reload();
  await expect(game.locator('#language')).toHaveValue('zh');
  await expect(game.getByRole('button',{name:'开启摄像头',exact:true})).toBeVisible();
  await expect(game.locator('.privacy')).toContainText('90');
  expect(await game.locator('.privacy').innerText()).toMatch(/[\u3400-\u9fff]/);
  await game.getByRole('button',{name:'试玩演示',exact:true}).click();
  await expect.poll(()=>game.locator('#scene').evaluate(()=>window.plankFlight.getState().audio.lastVoice?.language)).toBe('zh');
  await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
  await expect(game.getByRole('button',{name:'结束并休息',exact:true})).toBeVisible();
  const session=await game.locator('#scene').evaluate(()=>window.plankFlight.getState().sessionId);
  await expect(game.locator('#language')).toBeHidden();
  expect(await game.locator('#scene').evaluate(()=>window.plankFlight.getState().sessionId)).toBe(session);
  await expect.poll(()=>game.locator('#scene').evaluate(()=>window.plankFlight.getState().audio.encouragementReady)).toBe(18);
  await game.getByRole('button',{name:'结束并休息',exact:true}).click();
  await expect.poll(()=>game.locator('#scene').evaluate(()=>window.plankFlight.getState().audio.lastVoice?.id)).toMatch(/-end$/);
  const voice=await game.locator('#scene').evaluate(()=>window.plankFlight.getState().audio.lastVoice);
  expect(voice.language).toBe('zh');expect(voice.file).toMatch(/^zh\//);expect(voice.text).toMatch(/[\u4e00-\u9fff]/);
  await expect(page.locator('#local-result video')).toBeVisible({timeout:18000});
  await openReplay(page.locator('#local-result video'));
  expect(await page.locator('#local-result video').evaluate(async video=>{const a=new AudioContext();try{const b=await a.decodeAudioData(await(await fetch(video.src)).arrayBuffer());const d=b.getChannelData(0);return Math.sqrt(d.reduce((s,x)=>s+x*x,0)/d.length);}finally{await a.close();}})).toBeGreaterThan(.005);
  await expect(game.locator('#language')).toBeHidden();
  await page.reload();await expect(game.locator('#language')).toBeVisible();
  await game.locator('#language').selectOption('en');await page.reload();
  await expect(page.frameLocator('#game-frame').locator('#language')).toHaveValue('en');
  await expect(page.frameLocator('#game-frame').getByRole('button',{name:'Enable camera',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 });
});
