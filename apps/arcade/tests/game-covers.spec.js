import {test,expect} from '@playwright/test';
import {gameCatalog,playableGames} from '../game-catalog.js';

async function loaded(image){
 await expect(image).toBeVisible();
 await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
}

test('every catalog game has a distinct loaded cover and keeps its play link',async({page},info)=>{
 await page.goto('/');await page.locator('#other-games summary').click();
 const sources=[];
 for(const game of gameCatalog){
  const card=page.locator('.game-card').filter({has:page.locator(`a[href="/play/${game.id}"]`)});
  const image=card.locator('.game-art img');await image.scrollIntoViewIfNeeded();await loaded(image);
  sources.push(await image.getAttribute('src'));await expect(image).toHaveAttribute('alt',/.+/);
  await expect(card.locator('.game-art')).toHaveAttribute('href',`/play/${game.id}`);
 }
 expect(new Set(sources).size).toBe(gameCatalog.length);
 await expect(page.locator('.game-card').filter({has:page.locator('a[href="/play/orbit-pop"]')}).locator('.game-status')).toHaveText('Concept preview');
 await page.locator('#arcade').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('covers-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('covers-mobile.png'),fullPage:true});
 await page.goto('/play/orbit-pop');await loaded(page.locator('.concept-cover'));
 await page.locator('#pop-target').click();await expect(page.locator('#pop-score')).toHaveText('1');
});

test('all camera introductions show matching covers and accessible controls before camera permission',async({page},info)=>{
 test.setTimeout(90000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  window.coverCameraRequests=0;
  navigator.mediaDevices.getUserMedia=()=>{window.coverCameraRequests++;return Promise.reject(new DOMException('Camera must stay off before Start','NotAllowedError'));};
 });
 for(const item of playableGames){
  await page.goto(`/play/${item.id}`);const game=page.frameLocator('#game-frame');
  const image=game.locator('.game-entry-cover');await loaded(image);await expect(image).toHaveAttribute('src',new RegExp(item.id+'-v1'));
  await expect(game.locator('.game-entry h1')).toHaveText(item.title);
  for(const language of ['en','zh']){
   await game.locator('#entry-language').selectOption(language);
   for(const viewport of [{width:320,height:740},{width:844,height:390},{width:1440,height:960}]){
    await page.setViewportSize(viewport);await image.scrollIntoViewIfNeeded();await loaded(image);
    expect(await game.locator('.game-entry').evaluate(entry=>entry.scrollWidth<=entry.clientWidth+1)).toBe(true);
    const start=game.locator('.game-entry-actions button:visible').first();await start.scrollIntoViewIfNeeded();await expect(start).toBeInViewport();await expect(start).toBeEnabled();
   }
  }
  expect(await game.locator('body').evaluate(()=>window.coverCameraRequests)).toBe(0);
  if(['motion-quest','plank-flight','ar-invaders'].includes(item.id)){
   for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1440,height:960}]){
    await page.setViewportSize(viewport);await page.reload();await loaded(image);
    await expect(game.locator('.game-entry')).toHaveCount(1);
    await game.locator('.game-entry').evaluate(entry=>entry.scrollTop=0);
    await page.screenshot({path:info.outputPath(`${item.id}-${viewport.width}.png`)});
   }
  }
 }
 expect(errors).toEqual([]);
});
