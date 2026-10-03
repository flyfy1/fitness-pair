import {test,expect} from '@playwright/test';
import {syntheticCamera,confirmWithHand} from '../../camera-start/tests/browser/synthetic-camera.js';
import {syntheticCamera as flightCamera} from '../../../experiments/gameplay/plank-flight/tests/browser/synthetic-camera.js';

const clearHUD={inside:true,clear:true,nativeClear:true,followClear:true,tappable:true};
const geometry=game=>game.locator('body').evaluate(()=>{
 const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const overlap=(a,b)=>a.x<b.right-1&&b.x<a.right-1&&a.y<b.bottom-1&&b.y<a.bottom-1;
 const shared=box(document.querySelector('.hopmodo-conversation'));
 const hud=document.querySelector('header,.hud'),brand=box(hud.querySelector('.brand'));
 const buttons=[...hud.querySelectorAll('button:not([hidden])')].filter(e=>e.getBoundingClientRect().height);
 const native=[...buttons,...hud.querySelectorAll('#game-stats,.boss-hud,.stats')].filter(e=>e.getBoundingClientRect().height).map(box);
 const inside=r=>r.x>=-1&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<=innerHeight;
 const following=[...document.querySelectorAll('.session-info,.guidance,.arena-message')].filter(e=>e.getBoundingClientRect().height).map(box);
 const followClear=!document.documentElement.classList.contains('hopmodo-hud-stacked')||following.every(r=>r.y>=hud.getBoundingClientRect().bottom);
 const tappable=buttons.every(e=>{const r=box(e);return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
 return {inside:[shared,brand,...native].every(inside),clear:!overlap(shared,brand)&&native.every(r=>!overlap(shared,r)),nativeClear:native.every(r=>!overlap(brand,r)),followClear,tappable};
});

for(const id of ['motion-quest','jump-game','plank-flight'])test(`${id}: shared and native HUD controls remain distinct after resize and language changes`,async({page},info)=>{
 test.setTimeout(60000);
 const errors=[],uploads=[];page.on('pageerror',e=>errors.push(e.message));
 for(const pattern of ['**/g/collect*','**/cdn-cgi/rum*'])await page.route(pattern,r=>r.fulfill({status:204}));
 await page.route('**/api/play-sessions',r=>r.fulfill({status:201,json:{ok:true}}));
 page.on('request',r=>{if(['POST','PUT'].includes(r.method())&&!['/api/play-sessions','/g/collect','/cdn-cgi/rum'].includes(new URL(r.url()).pathname))uploads.push(r.url());});
 if(id==='jump-game')await syntheticCamera(page);
 if(id==='plank-flight')await flightCamera(page);
 await page.setViewportSize({width:390,height:844});await page.goto('/play/'+id);const game=page.frameLocator('#game-frame');
 if(id==='jump-game'){await game.locator('#primary').click();await expect(game.locator('#instruction')).toHaveText('Bring your hands together.',{timeout:12000});await confirmWithHand(game);}
 else if(id==='plank-flight'){await game.locator('#entry-language').selectOption('zh');await game.locator('#start').click();}
 else await game.locator('#demo').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording',{timeout:12000});
 if(id==='jump-game')await game.locator('#primary').click();
 if(id==='plank-flight'){await game.locator('body').evaluate(()=>window.testMissing=true);await expect.poll(()=>game.locator('body').evaluate(()=>window.plankFlight.getState().status)).toBe('paused');}
 for(const viewport of [{width:390,height:844},{width:320,height:740},{width:844,height:390},{width:1440,height:1000}]){
  await page.setViewportSize(viewport);
  for(const language of id==='plank-flight'?['zh']:['en','zh']){
   // Flight deliberately hides initial configuration after entry.
   if(id==='plank-flight')await expect(game.locator('select#language')).toBeHidden();
   else await game.locator('select#language').selectOption(language);
   await expect.poll(()=>geometry(game)).toEqual(clearHUD);
   await expect(game.locator('[data-stop-game]')).toBeInViewport();
   if(viewport.width===390&&language==='en')await page.screenshot({path:info.outputPath('hud-phone.png')});
  }
 }
 await page.setViewportSize({width:390,height:844});
 if(id!=='motion-quest'){
  await game.locator('#fullscreen').click();await expect(game.locator('#fullscreen')).toHaveAttribute('aria-pressed','true');await expect.poll(()=>geometry(game)).toEqual(clearHUD);
  await game.locator('#fullscreen').click();await expect(game.locator('#fullscreen')).toHaveAttribute('aria-pressed','false');await expect.poll(()=>geometry(game)).toEqual(clearHUD);
 }
 expect(errors).toEqual([]);expect(uploads).toEqual([]);
});
