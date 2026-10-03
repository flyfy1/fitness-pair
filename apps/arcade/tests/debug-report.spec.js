import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {camera} from './start-camera-fixture.js';
import {syntheticCamera as flightCamera} from '../../../experiments/gameplay/plank-flight/tests/browser/synthetic-camera.js';

async function speechMock(page){await page.addInitScript(()=>{
 if(window!==top)return;
 window.debugSpeechStarts=0;window.debugSpeechStops=0;
 window.SpeechRecognition=class {
  start(){window.debugSpeech=this;window.debugSpeechStarts++;this.started=true;if(window.debugSpeechDeny)this.onerror?.({error:'not-allowed'});else this.onstart?.();}
  stop(){this.started=false;window.debugSpeechStops++;}abort(){this.stop();}
  emit(transcript){const result=Object.assign([{transcript}],{isFinal:true});this.onresult?.({resultIndex:0,results:[result]});}
 };
});}
async function openDebug(page,game){await game.getByRole('button',{name:'Debug report',exact:true}).click();const panel=page.getByRole('dialog',{name:'Debug capture'});await expect(panel).toBeVisible();return panel;}
async function readReport(page,panel){const pending=page.waitForEvent('download');await panel.getByRole('link',{name:'Download diagnostic JSON'}).click();return JSON.parse(await readFile(await(await pending).path(),'utf8'));}
async function brokenStart(page){await camera(page);await page.goto('/play/ar-breakout');const game=page.frameLocator('#game-frame');await game.locator('#start').click();await expect(game.locator('.hands-start')).toBeVisible();await game.locator('body').evaluate(()=>window.startPose.hideHands=true);return game;}

for(const id of ['ar-breakout','ar-invaders','ar-stack','ar-knife','ar-bubble','ar-fruit','motion-quest','jump-game','plank-flight'])test(`${id}: a short debug recording saves locally without another camera or public upload`,async({page},info)=>{
 const uploads=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/debug-reports'))uploads.push(request.url());});
 if(id==='plank-flight')await flightCamera(page);else await camera(page);
 await page.goto('/play/'+id);const game=page.frameLocator('#game-frame');if(id==='ar-invaders')await game.locator('#tutorial-skip').click();
 await game.locator(id==='jump-game'?'#primary':'#start').click();
 if(id!=='plank-flight')await expect(game.locator('.hands-start')).toBeVisible({timeout:12000});
 else await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:12000});
 const panel=await openDebug(page,game);await expect(panel.getByLabel('Send captures to the private debug server')).not.toBeChecked();
 await panel.getByRole('button',{name:'Record 5-second debug',exact:true}).click();await expect(page.locator('.debug-capture-notice')).toBeVisible();
 await expect(page.getByRole('dialog',{name:'Debug capture'})).toBeVisible({timeout:15000});
 const review=page.getByRole('dialog',{name:'Debug capture'});await expect(review.locator('video')).toBeVisible();
 await expect.poll(()=>review.locator('video').evaluate(video=>video.readyState)).toBeGreaterThan(1);
 const report=await readReport(page,review);expect(report.gameId).toBe(id);expect(report.trigger).toBe('button');expect(report.includeVideo).toBe(false);
 expect(report.clip.duration).toBeGreaterThan(4);expect(report.clip.duration).toBeLessThan(6.5);expect(report.clip.bytes).toBeGreaterThan(1000);
 expect(report.tracking.samples.length).toBeGreaterThan(30);expect(report.tracking.sessionId).toBe(report.sessionId);expect(report.diagnostics.contexts.length).toBeGreaterThan(30);
 expect(report.tracking.samples.every(sample=>sample.videoMs>=0&&sample.videoMs<=report.clip.duration*1000+50)).toBe(true);
 if(id.startsWith('ar-')){const context=report.diagnostics.contexts.find(sample=>sample.recognition?.action);expect(context.recognition.start.open).toBe(false);expect(context.recognition.action.inputSeq).toBe(context.inputSeq);}
 if(id!=='plank-flight')expect(await game.locator('body').evaluate(()=>({cameras:window.cameraRequests,workers:window.workerCreations,live:window.startStream.getVideoTracks()[0].readyState}))).toEqual({cameras:1,workers:1,live:'live'});
 expect(uploads).toEqual([]);await page.screenshot({path:info.outputPath('debug-review.png')});
 // Seek to the retained ending to verify a decodable short video, not just a Blob.
 await review.locator('video').evaluate(video=>{video.currentTime=3;});await expect.poll(()=>review.locator('video').evaluate(video=>!video.seeking&&video.currentTime>=3)).toBe(true);
 if(id==='ar-breakout'){await page.reload();const reloaded=await openDebug(page,page.frameLocator('#game-frame'));await expect(reloaded.locator('video')).toBeVisible();expect((await readReport(page,reloaded)).id).toBe(report.id);}
});

test('English speech records setup failure and automatically uploads only after private opt-in; duplicates do not record twice',async({page})=>{
 await speechMock(page);const game=await brokenStart(page);let report=null,videos=[];
 await page.route(url=>url.pathname==='/api/debug-reports',async route=>{report=route.request().postDataJSON();await route.fulfill({status:201,json:{ok:true,id:report.id}});});
 await page.route(url=>/\/api\/debug-reports\/[^/]+\/video$/.test(url.pathname),async route=>{videos.push({bytes:route.request().postDataBuffer().length,headers:route.request().headers()});await route.fulfill({status:201,json:{ok:true}});});
 const panel=await openDebug(page,game);await panel.getByLabel('Send captures to the private debug server').check();await panel.getByRole('button',{name:'Enable voice command'}).click();
 await expect(panel.getByRole('status')).toContainText('Say “debug please”');expect(await page.evaluate(()=>window.debugSpeech.lang)).toBe('en-US');await panel.getByRole('button',{name:'Continue playing'}).click();
 await page.evaluate(()=>{window.debugSpeech.emit('debug please');window.debugSpeech.emit('DEBUG PLEASE!');});await expect(page.locator('.debug-capture-notice')).toBeVisible();
 const review=page.getByRole('dialog',{name:'Debug capture'});await expect(review.getByRole('status')).toContainText('Debug uploaded privately. Reference:',{timeout:15000});
 expect(report).toMatchObject({consent:'debug-data-v1',trigger:'voice',includeVideo:true,gameId:'ar-breakout',gameState:{phase:'setup'}});
 expect(report.diagnostics.contexts.some(sample=>sample.recognition?.gesture?.missingJoints?.includes('leftWrist'))).toBe(true);
 expect(videos).toHaveLength(1);expect(videos[0].bytes).toBe(report.clip.bytes);expect(videos[0].headers['x-debug-video-consent']).toBe('debug-video-v1');
 await review.getByRole('button',{name:'Disable voice command'}).click();expect(await page.evaluate(()=>window.debugSpeech.started)).toBe(false);expect(await game.locator('body').evaluate(()=>window.startStream.getVideoTracks()[0].readyState)).toBe('live');
});

test('upload failure retains video and diagnostic downloads and retries the same private report',async({page})=>{
 const game=await brokenStart(page);let posts=0,puts=0;
 await page.route(url=>url.pathname==='/api/debug-reports',async route=>{posts++;await route.fulfill({status:201,json:{ok:true}});});
 await page.route(url=>/\/api\/debug-reports\/[^/]+\/video$/.test(url.pathname),async route=>{puts++;await route.fulfill({status:puts===1?503:201,json:puts===1?{error:'Storage temporarily unavailable.'}:{ok:true}});});
 const panel=await openDebug(page,game);await panel.getByLabel('Send captures to the private debug server').check();await panel.getByRole('button',{name:'Record 5-second debug',exact:true}).click();
 const review=page.getByRole('dialog',{name:'Debug capture'});await expect(review.getByRole('status')).toContainText('Local video and JSON remain available.',{timeout:15000});
 await expect(review.getByRole('link',{name:'Download debug video'})).toBeVisible();const report=await readReport(page,review);
 await review.getByRole('button',{name:'Upload this capture privately'}).click();await expect(review.getByRole('status')).toContainText(report.id);expect(posts).toBe(1);expect(puts).toBe(2);
});

test('permission denial and hiding the page stop voice; canceling debug preserves the source camera',async({page})=>{
 await speechMock(page);const game=await brokenStart(page);const panel=await openDebug(page,game);
 await page.evaluate(()=>window.debugSpeechDeny=true);await panel.getByRole('button',{name:'Enable voice command'}).click();await expect(panel.getByRole('status')).toContainText('Microphone permission was denied');await expect(panel.getByRole('button',{name:'Enable voice command'})).toBeVisible();
 await page.evaluate(()=>window.debugSpeechDeny=false);await panel.getByRole('button',{name:'Enable voice command'}).click();await panel.getByRole('button',{name:'Continue playing'}).click();
 await page.evaluate(()=>window.debugSpeech.emit('debug please'));await expect(page.locator('.debug-capture-notice')).toBeVisible();await page.getByRole('button',{name:'Cancel debug'}).click();
 await expect(page.getByRole('dialog',{name:'Debug capture'}).getByRole('status')).toContainText('Debug recording canceled.');
 expect(await game.locator('body').evaluate(()=>window.startStream.getVideoTracks()[0].readyState)).toBe('live');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 const starts=await page.evaluate(()=>window.debugSpeechStarts);await page.waitForTimeout(700);expect(await page.evaluate(()=>window.debugSpeechStarts)).toBe(starts);expect(await page.evaluate(()=>window.debugSpeech.started)).toBe(false);
});

test('unsupported speech and an inactive camera explain the manual path without starting new media',async({page})=>{
 await page.addInitScript(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});await camera(page);await page.goto('/play/ar-breakout');const game=page.frameLocator('#game-frame'),panel=await openDebug(page,game);
 await panel.getByRole('button',{name:'Enable voice command'}).click();await expect(panel.getByRole('status')).toContainText('Voice commands are unavailable');
 await panel.getByRole('button',{name:'Record 5-second debug',exact:true}).click();await expect(page.getByRole('dialog',{name:'Debug capture'}).getByRole('status')).toContainText('Start the camera or a game preview');
 expect(await game.locator('body').evaluate(()=>window.cameraRequests)).toBe(0);
});

test('Chinese UI and voice use the selected language while the five-second notice leaves the game visible',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await speechMock(page);await page.addInitScript(()=>localStorage.setItem('hopmodo.language','zh'));await camera(page);await page.goto('/play/ar-breakout');const game=page.frameLocator('#game-frame');await game.locator('#start').click();await expect(game.locator('.hands-start')).toBeVisible();await game.locator('[data-debug-report]').click();
 const panel=page.getByRole('dialog',{name:'调试捕获'});await panel.getByRole('button',{name:'启用语音指令'}).click();await expect(panel.getByRole('status')).toContainText('正在聆听');expect(await page.evaluate(()=>window.debugSpeech.lang)).toBe('zh-CN');await panel.locator('[data-cancel]').click();
 await page.evaluate(()=>window.debugSpeech.emit('我要上传 debug'));await expect(page.locator('.debug-capture-notice')).toContainText('正在调试录制');await expect(game.locator('.hands-start')).toBeVisible();await page.screenshot({path:info.outputPath('debug-capture-phone.png')});
 const review=page.getByRole('dialog',{name:'调试捕获'});await expect(review.getByRole('link',{name:'下载诊断 JSON'})).toBeVisible({timeout:15000});await page.screenshot({path:info.outputPath('debug-review-phone.png')});
});

test('opt-in live gateway persists a synthetic short debug capture',async({page},info)=>{
 test.skip(process.env.DEBUG_LIVE_UPLOAD!=='1','Explicit opt-in is required to create a private server report.');
 const game=await brokenStart(page),panel=await openDebug(page,game);
 await panel.getByLabel('Send captures to the private debug server').check();
 await panel.getByRole('button',{name:'Record 5-second debug',exact:true}).click();
 const review=page.getByRole('dialog',{name:'Debug capture'});
 await expect(review.getByRole('status')).toContainText('Debug uploaded privately. Reference:',{timeout:25000});
 const report=await readReport(page,review);
 expect(report.tracking.samples.length).toBeGreaterThan(30);
 expect(report.diagnostics.contexts.some(sample=>sample.recognition?.gesture?.missingJoints?.includes('leftWrist'))).toBe(true);
 const pending=page.waitForEvent('download');await review.getByRole('link',{name:'Download debug video'}).click();
 const video=await readFile(await(await pending).path());
 expect(video.length).toBe(report.clip.bytes);
 await writeFile(info.outputPath('live-debug-proof.json'),JSON.stringify({provenance:'synthetic browser camera and pose fixture',origin:new URL(page.url()).origin,id:report.id,bytes:video.length,sha256:createHash('sha256').update(video).digest('hex'),duration:report.clip.duration,trackingSamples:report.tracking.samples.length,contexts:report.diagnostics.contexts.length},null,2));
 await review.locator('video').evaluate(video=>{video.currentTime=3;});
 await expect.poll(()=>review.locator('video').evaluate(video=>!video.seeking&&video.currentTime>=3)).toBe(true);
 await page.screenshot({path:info.outputPath('live-debug-review.png')});
});
