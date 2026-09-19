import {test,expect} from '@playwright/test';
import {camera} from './start-camera-fixture.js';

async function speechMock(page){
 await page.addInitScript(()=>{
  if(window!==top)return;
  class MockSpeechRecognition{
   start(){window.debugSpeech=this;this.started=true;}
   stop(){this.started=false;}
   emit(transcript){const result=Object.assign([{transcript}],{isFinal:true});this.onresult?.({resultIndex:0,results:[result]});}
  }
  window.SpeechRecognition=MockSpeechRecognition;
 });
}

test('opt-in voice command uploads recorded movement data without video by default',async({page})=>{
 await page.setViewportSize({width:390,height:844});await speechMock(page);await camera(page);let report=null,videoUploads=0;
 await page.route(url=>url.pathname==='/api/debug-reports',async route=>{report=route.request().postDataJSON();await route.fulfill({status:201,json:{ok:true,id:report.id,video:{status:'not-requested'}}});});
 await page.route(url=>/\/api\/debug-reports\/[^/]+\/video$/.test(url.pathname),async route=>{videoUploads++;await route.fulfill({status:201,json:{ok:true}});});
 await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');await game.locator('#start').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await game.getByRole('button',{name:'Debug report'}).click();let dialog=page.getByRole('dialog',{name:'Upload debug?'});await expect(dialog.getByLabel('Include gameplay video')).not.toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await dialog.getByRole('button',{name:'Enable voice command'}).click();await expect(dialog.getByRole('status')).toContainText('say “我要上传 debug”');await dialog.getByRole('button',{name:'Continue playing'}).click();
 await page.evaluate(()=>window.debugSpeech.emit('我要上传 debug'));dialog=page.getByRole('dialog',{name:'Upload debug?'});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Upload debug'}).click();
 await expect(dialog.getByRole('status')).toContainText('Debug uploaded. Reference:');expect(report).toMatchObject({version:1,consent:'debug-data-v1',trigger:'voice',includeVideo:false,gameId:'motion-quest'});
 expect(report.tracking.format).toBe('fitness-pair/tracking-session/1');expect(report.tracking.samples.length).toBeGreaterThan(0);expect(report.tracking.sessionId).toBe(report.sessionId);expect(videoUploads).toBe(0);
});

test('a manual report uploads video only after the player selects it',async({page})=>{
 let report=null,video=null;
 await page.route(url=>url.pathname==='/api/debug-reports',async route=>{report=route.request().postDataJSON();await route.fulfill({status:201,json:{ok:true,id:report.id,video:{status:'pending'}}});});
 await page.route(url=>/\/api\/debug-reports\/[^/]+\/video$/.test(url.pathname),async route=>{video={headers:route.request().headers(),bytes:route.request().postDataBuffer().length};await route.fulfill({status:201,json:{ok:true,id:report.id}});});
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await game.getByRole('button',{name:'Debug report'}).click();const dialog=page.getByRole('dialog',{name:'Upload debug?'});await dialog.getByLabel('Include gameplay video').check();await dialog.getByRole('button',{name:'Upload debug'}).click();
 await expect(dialog.getByRole('status')).toContainText('Debug uploaded. Reference:');expect(report.includeVideo).toBe(true);expect(video.bytes).toBeGreaterThan(0);expect(video.headers['x-debug-video-consent']).toBe('debug-video-v1');expect(video.headers['content-type']).toMatch(/^video\/(mp4|webm)/);
});
