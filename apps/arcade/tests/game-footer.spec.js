import {test,expect} from '@playwright/test';
import {syntheticCamera} from '../../../experiments/gameplay/plank-flight/tests/browser/synthetic-camera.js';
import {readStoredClip} from './read-stored-clip.js';
import {openReplay} from './open-replay.js';

async function readable(game){
 await expect.poll(()=>game.locator('body').evaluate(()=>{
  const note=document.querySelector('.privacy').getBoundingClientRect(),footer=document.querySelector('.toolbar').getBoundingClientRect(),cue=document.querySelector('.cue').getBoundingClientRect();
  return note.height>0&&note.x>=0&&note.right<=innerWidth&&note.bottom<=innerHeight
   &&footer.x>=0&&footer.right<=innerWidth&&footer.bottom+8<=note.top
   &&cue.top>=0&&cue.bottom+8<=footer.top;
 })).toBe(true);
 for(const id of ['stop','sound','fullscreen'])await expect(game.locator('#'+id)).toBeInViewport();
}

for(const language of ['en','zh'])test(`${language}: hosted Flight footer stays readable through resize, text enlargement and fullscreen`,async({page},info)=>{
 await syntheticCamera(page);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
 await game.locator('#entry-language').selectOption(language);await game.locator('#start').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 const initial=await game.locator('body').evaluate(()=>{window.originalWorker=window.testWorker;window.originalStream=window.testStream;return window.plankFlight.getState();});
 await game.locator('body').evaluate(()=>window.testMissing=true);
 await expect.poll(()=>game.locator('body').evaluate(()=>window.plankFlight.getState().status)).toBe('paused');
 for(const viewport of [{width:390,height:844},{width:320,height:740},{width:844,height:390},{width:1280,height:900}]){
  await page.setViewportSize(viewport);await readable(game);
  await expect(game.locator('.privacy')).toContainText(language==='zh'?'自动录下游戏和摄像头画面':'record automatically');
  await expect(game.locator('.privacy')).toContainText(language==='zh'?'只有主动分享时才会上传视频':'Video is uploaded only when you choose to share');
  if(viewport.width===390)await page.screenshot({path:info.outputPath(`footer-${language}-portrait.png`)});
  if(viewport.width===844)await page.screenshot({path:info.outputPath(`footer-${language}-landscape.png`)});
 }
 await page.setViewportSize({width:390,height:844});
 // Text-size preferences change wrapping without a viewport resize event.
 await game.locator('.privacy').evaluate(note=>note.style.fontSize='16px');await readable(game);
 await game.locator('.privacy').evaluate(note=>note.style.fontSize='');await readable(game);
 await game.locator('#fullscreen').click();await expect(game.locator('#fullscreen')).toHaveAttribute('aria-pressed','true');await readable(game);
 await game.locator('#fullscreen').click();await expect(game.locator('#fullscreen')).toHaveAttribute('aria-pressed','false');await readable(game);
 expect(await game.locator('body').evaluate(()=>window.testWorker===window.originalWorker&&window.testStream===window.originalStream)).toBe(true);
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await game.locator('#stop').click();await expect(page.locator('#local-result video')).toHaveCount(1,{timeout:15000});
 const clip=await readStoredClip(page,'plank-flight');expect(clip.sessionId).toBe(initial.sessionId);expect(clip.tracking.sampleSessionIds).toEqual([initial.sessionId]);
 await openReplay(page.locator('#local-result video'));expect(await page.locator('#local-result video').evaluate(video=>video.duration)).toBeGreaterThan(3);
 expect(await game.locator('body').evaluate(()=>window.testWorker.terminated&&window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
 expect(errors).toEqual([]);
});
