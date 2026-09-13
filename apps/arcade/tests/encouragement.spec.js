import {test,expect} from '@playwright/test';
import pack from '../../../experiments/gameplay/plank-flight/resources/encouragement.json' with {type:'json'};

test('all GPT speech and music resources decode from the mounted game',async({page})=>{
 await page.goto('/play/plank-flight');
 await page.setViewportSize({width:844,height:390});
 await expect(page.frameLocator('#game-frame').getByText('AI-generated voices',{exact:true})).toBeInViewport();
 const levels=await page.evaluate(async pack=>{
  const audio=new AudioContext(),results=[];
  try{
   const files=[...pack.clips.map(x=>`${x.id}.mp3`),...pack.styles.map(x=>`music-${x.id}.wav`)];
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
 expect(levels).toHaveLength(24);
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
 const recorded=await page.locator('#local-result video').evaluate(async video=>{
  const audio=new AudioContext();try{
   const data=await audio.decodeAudioData(await(await fetch(video.src)).arrayBuffer()),samples=data.getChannelData(0);
   return {duration:data.duration,rms:Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length)};
  }finally{await audio.close();}
 });
 expect(recorded.duration).toBeGreaterThan(heard[1].time);expect(recorded.rms).toBeGreaterThan(.005);
 expect(external).toEqual([]);
});
