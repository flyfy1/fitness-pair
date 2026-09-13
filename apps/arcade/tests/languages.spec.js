import {openReplay} from './open-replay.js';
import {camera} from './start-camera-fixture.js';
import {syntheticCamera,confirmWithHand} from '../../camera-start/tests/browser/synthetic-camera.js';
import {test,expect} from '@playwright/test';
import {gameGuides} from '../src/game-guides.js';

test.describe('site language',()=>{
 test.use({locale:'zh-CN'});
 test('all visible guide steps and diagrams translate and restore their English source',async({page})=>{
  await page.goto('/');
  for(const id of ['motion-quest','plank-flight','jump-game']){
   await page.locator('#site-language').selectOption('zh');
   await page.locator(`a.game-art[href="/play/${id}"]`).click();
   const dialog=page.locator('dialog[open]'),guide=gameGuides[id];
   await expect(dialog.locator('.guide-setup h3')).toHaveText(/[\u3400-\u9fff]/);
   for(const text of [guide.goal,guide.setup,guide.pause,...guide.steps.flat(),...guide.tiles.map(tile=>tile[1])])await expect(dialog).not.toContainText(text);
   await dialog.locator('.guide-close').click();
   await page.locator('#site-language').selectOption('en');
   await page.locator(`a.game-art[href="/play/${id}"]`).click();
   for(const text of [guide.goal,guide.setup,guide.pause,...guide.steps.flat()])await expect(dialog).toContainText(text);
   await dialog.locator('.guide-close').click();
  }
 });
 test('login and account failures follow the selected language',async({page})=>{
  await page.route('**/api/auth/session',route=>route.fulfill({json:{enabled:true,user:null}}));
  await page.goto('/shared?login=expired');
  await expect(page.locator('[data-account-body]')).not.toContainText('Your login attempt expired. Please start again.');
  await page.locator('#site-language').selectOption('en');
  await expect(page.locator('[data-account-body]')).toContainText('Your login attempt expired. Please start again.');
  await page.route('**/api/auth/session',route=>route.fulfill({json:{enabled:true,user:{email:'synthetic@example.test'}}}));
  await page.route('**/api/account/clips',route=>route.fulfill({status:503,json:{error:'The gallery could not load. Please retry.'}}));
  await page.locator('#site-language').selectOption('zh');await page.reload();
  await expect(page.locator('[data-account-body] .empty-state')).toBeVisible();
  await expect(page.locator('[data-account-body]')).not.toContainText('The gallery could not load. Please retry.');
  await page.locator('#site-language').selectOption('en');
  await expect(page.locator('[data-account-body]')).toContainText('The gallery could not load. Please retry.');
 });
 test('browser default, full menus, guide, game and library follow the saved choice',async({page})=>{
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  await expect(page.locator('#site-language')).toHaveValue('zh');
  expect(await page.evaluate(()=>localStorage.getItem('hopmodo.language'))).toBeNull();
  for(const link of await page.locator('nav a').all())expect(await link.innerText()).toMatch(/[\u3400-\u9fff]/);
  await page.locator('a.game-art[href="/play/motion-quest"]').click();
  await expect(page.locator('dialog')).toBeVisible();
  expect(await page.locator('.guide-goal').innerText()).toMatch(/[\u3400-\u9fff]/);
  await page.locator('dialog a.primary').click();
  const game=page.frameLocator('#game-frame');
  await expect(game.locator('html')).toHaveAttribute('lang','zh-CN');
  await expect(game.locator('#language')).toHaveValue('zh');
  expect(await game.locator('#start').innerText()).toMatch(/[\u3400-\u9fff]/);
  expect(await page.locator('#record-panel').innerText()).toMatch(/[\u3400-\u9fff]/);
  await game.locator('#language').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(game.locator('#start')).toContainText('Enable camera');
  await page.goto('/library');
  await expect(page.locator('#site-language')).toHaveValue('en');
  await page.locator('#site-language').selectOption('zh');await page.reload();
  await expect(page.locator('#site-language')).toHaveValue('zh');
  expect(await page.locator('main h1').innerText()).toMatch(/[\u3400-\u9fff]/);
 });
 test('storage denied still synchronizes initial language with the parent and retains it during flight',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage blocked','SecurityError');}}));
  await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
  await expect(game.locator('#language')).toHaveValue('zh');
  await game.locator('#language').selectOption('en');
  await game.locator('#demo').click();
  await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
  const session=await game.locator('#scene').evaluate(()=>window.plankFlight.getState().sessionId);
  await expect(game.locator('#language')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(game.locator('html')).toHaveAttribute('lang','en');
  await expect(game.locator('#stop')).toHaveText('Finish & rest');
  expect(await game.locator('#scene').evaluate(()=>window.plankFlight.getState().sessionId)).toBe(session);
  await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
  await game.locator('#stop').click();
  await expect(page.locator('#local-result')).toBeVisible({timeout:20000});
 });
 test('Chinese and English controls remain reachable on small screens',async({page},info)=>{
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});await page.goto('/');
   for(const lang of ['zh','en']){
    await page.locator('#site-language').selectOption(lang);
    await expect(page.locator('#site-language')).toBeInViewport();
    for(const link of await page.locator('nav a').all())await expect(link).toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   }
   await page.screenshot({path:info.outputPath(`menu-${width}.png`)});
   for(const id of ['motion-quest','plank-flight','jump-game']){
    await page.goto('/play/'+id);const game=page.frameLocator('#game-frame');
    await game.locator('#language').selectOption('zh');
    await expect(game.locator('#language')).toBeInViewport();
    await expect(game.locator('.hopmodo-conversation button[aria-pressed]').first()).toBeInViewport();
    expect(await game.locator('html').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`${id}-${width}.png`)});
   }
  }
 });
 test('Chinese Motion Quest completes a recorded round and keeps its audio stream when language changes',async({page})=>{
  test.setTimeout(60000);await camera(page);await page.goto('/play/motion-quest');
  const game=page.frameLocator('#game-frame');
  await game.locator('#start').click();await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
  const stream=await game.locator('body').evaluate(()=>window.motionQuest.getAudioStream().id);
  for(let rep=1;rep<=5;rep++){
   await game.locator('body').evaluate(()=>{window.startPose.squat=true;});
   await expect(game.locator('#charge-value')).toHaveText('100%');await page.waitForTimeout(350);
   if(rep===2){
    await game.locator('#language').selectOption('en');
    expect(await game.locator('body').evaluate(()=>window.motionQuest.getAudioStream().id)).toBe(stream);
    await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
    await game.locator('#language').selectOption('zh');
   }
   await game.locator('body').evaluate(()=>{window.startPose.squat=false;});
   await expect(game.locator('#rep-count')).toHaveText(String(rep));
   if(rep<5)await page.waitForTimeout(1050);
  }
  await expect(game.locator('#victory')).toBeVisible();
  await expect(game.locator('#arena-subtitle')).toContainText('已命中 5 / 5 次');
  await expect(page.locator('#local-result h3').first()).toHaveText('Motion Quest · 我的回放',{timeout:20000});
  await expect(page.locator('#local-result video')).toBeVisible({timeout:20000});
  expect(await game.locator('body').evaluate(()=>window.startWorker.terminated&&window.startStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  await openReplay(page.locator('#local-result video'));
  const level=await page.locator('#local-result video').evaluate(async video=>{
   const context=new AudioContext();try{const buffer=await context.decodeAudioData(await(await fetch(video.src)).arrayBuffer());const data=buffer.getChannelData(0);return Math.sqrt(data.reduce((sum,value)=>sum+value*value,0)/data.length);}finally{await context.close();}
  });
  expect(level).toBeGreaterThan(.001);
 });
 test('Jump Game uses Chinese setup and countdown speech with a stable recording stream',async({page})=>{
  await syntheticCamera(page);await page.goto('/play/jump-game');const game=page.frameLocator('#game-frame');
  await game.locator('#primary').click();await expect(game.locator('#instruction')).toContainText('左手',{timeout:15000});
  await confirmWithHand(game);
  await expect.poll(()=>game.locator('body').evaluate(()=>window.cameraSetup.getState().audio.lastVoice?.language)).toBe('zh');
  await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
  await game.locator('#show-settings').click();await game.locator('#end-run').click();
  await expect(page.locator('#local-result video')).toBeVisible({timeout:20000});
 });
 test('player-created titles are preserved and login receives the current language',async({page})=>{
  await page.route('**/api/auth/session',route=>route.fulfill({json:{enabled:true,user:null}}));
  await page.goto('/shared');
  await expect(page.locator('a[href^="/api/auth/start"]').first()).toHaveAttribute('href',/lang=zh-CN/);
  await page.locator('#site-language').selectOption('en');
  await expect(page.locator('a[href^="/api/auth/start"]').first()).toHaveAttribute('href',/lang=en/);
  await page.route('**/api/clips/550e8400-e29b-41d4-a716-446655440000',route=>route.fulfill({json:{id:'550e8400-e29b-41d4-a716-446655440000',title:'The arcade',game:'motion-quest',expiresAt:Date.now()+86400000,source:'synthetic'}}));
  await page.goto('/clips/550e8400-e29b-41d4-a716-446655440000');
  await page.locator('#site-language').selectOption('zh');
  await expect(page.locator('main h1')).toHaveText('The arcade');
  await page.route('**/api/clips',route=>route.fulfill({json:{enabled:true,clips:[{id:'550e8400-e29b-41d4-a716-446655440000',title:'The arcade',game:'motion-quest',source:'synthetic'}]}}));
  await page.goto('/gallery');await expect(page.locator('.clip-card h3')).toHaveText('The arcade');
 });
});
test.describe('unsupported browser language',()=>{
 test.use({locale:'fr-FR'});
 test('falls back to English',async({page})=>{await page.goto('/');await expect(page.locator('#site-language')).toHaveValue('en');await expect(page.locator('html')).toHaveAttribute('lang','en');});
});
