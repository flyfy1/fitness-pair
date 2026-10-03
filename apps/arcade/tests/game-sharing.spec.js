import {test,expect} from '@playwright/test';
import {gameCatalog} from '../game-catalog.js';

async function setup(page,{blocked=false}={}){
 await page.addInitScript(({blocked})=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(blocked)throw new Error('Denied');window.gameInvitation=text;}}});
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.nativeInvitation=data;}});
  navigator.mediaDevices.getUserMedia=async()=>{throw new Error('Sharing must not open a camera');};
 },{blocked});
 for(const pattern of ['**/g/collect*','**/cdn-cgi/rum*'])await page.route(pattern,r=>r.fulfill({status:204}));
 await page.route('**/api/play-sessions',r=>r.fulfill({status:201,json:{ok:true}}));
}
for(const game of gameCatalog)test(`${game.id}: game sharing is available before play`,async({page})=>{
 await setup(page);await page.setViewportSize({width:320,height:740});await page.goto('/play/'+game.id);
 const host=game.kind==='playable'?page.frameLocator('#game-frame'):page;
 await host.getByRole('button',{name:'Share game',exact:true}).click();const dialog=host.locator('.game-share-dialog');
 await expect(dialog).toBeVisible();await expect(dialog.getByRole('link')).toHaveCount(5);
 const value=await dialog.locator('textarea').inputValue();expect(value).toContain('https://fitness.integ.life/play/'+game.id+'?lang=en');expect(value).not.toContain('/clips/');
 await dialog.getByRole('button',{name:'Copy invitation',exact:true}).click();
 expect(await dialog.evaluate(el=>el.ownerDocument.defaultView.gameInvitation)).toBe(value);
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await dialog.getByRole('button',{name:'Close game sharing'}).click();await expect(dialog).not.toBeVisible();
 await expect(host.getByRole('button',{name:'Share game',exact:true})).toBeFocused();
});

test('game invitations, platform destinations and recipient entry follow the current language',async({page,context})=>{
 await setup(page);await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await game.locator('#entry-language').selectOption('zh');await game.getByRole('button',{name:'分享游戏',exact:true}).click();const dialog=game.locator('.game-share-dialog');
 await expect(dialog.locator('textarea')).toHaveValue(/来 Hopmodo 试试/);const text=await dialog.locator('textarea').inputValue();
 expect(text).toContain('?lang=zh');await dialog.getByRole('button',{name:'更多应用…',exact:true}).click();
 expect((await dialog.evaluate(el=>el.ownerDocument.defaultView.nativeInvitation)).text).toBe(text);
 await context.route(/https:\/\/(www.instagram.com|www.linkedin.com|www.facebook.com|x.com|wa.me)\//,r=>r.fulfill({body:'Synthetic social composer boundary'}));
 for(const platform of ['X (Twitter)','Instagram','Facebook','LinkedIn','WhatsApp']){
  const link=dialog.getByRole('link',{name:'通过 '+platform+' 分享游戏',exact:true});await expect(link).toHaveAttribute('rel','noopener noreferrer');
  const opened=context.waitForEvent('page');await link.click();const popup=await opened;
  if(['X (Twitter)','WhatsApp'].includes(platform))expect(new URL(popup.url()).searchParams.get('text')).toBe(text);
  else expect(await dialog.evaluate(el=>el.ownerDocument.defaultView.gameInvitation)).toBe(text);
  expect(await popup.evaluate(()=>window.opener)).toBeNull();await popup.close();
 }
 await dialog.getByRole('button',{name:'关闭游戏分享'}).click();await game.locator('#entry-language').selectOption('en');await game.getByRole('button',{name:'Share game',exact:true}).click();
 await expect(dialog.locator('textarea')).toHaveValue(/Try Motion Quest on Hopmodo!/);expect(await dialog.locator('textarea').inputValue()).toContain('?lang=en');
 const recipient=await context.newPage();await recipient.goto('/play/motion-quest?lang=zh');await expect(recipient.frameLocator('#game-frame').locator('#entry-language')).toHaveValue('zh');await recipient.close();
});

test('blocked copying retains selectable localized invitation and Escape restores focus',async({page})=>{
 await setup(page,{blocked:true});await page.goto('/play/motion-quest?lang=zh');const game=page.frameLocator('#game-frame');
 await game.getByRole('button',{name:'分享游戏',exact:true}).click();const dialog=game.locator('.game-share-dialog');
 await dialog.getByRole('button',{name:'复制邀请文案',exact:true}).click();const field=dialog.locator('textarea');await expect(field).toBeFocused();
 expect(await field.evaluate(el=>el.selectionEnd-el.selectionStart)).toBe((await field.inputValue()).length);await expect(dialog.getByRole('status')).toHaveText(/无法自动复制/);
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(game.getByRole('button',{name:'分享游戏',exact:true})).toBeFocused();
});

test('game-guide invitation shares that game without starting it',async({page})=>{
 await setup(page);await page.goto('/#arcade');await page.getByRole('heading',{name:'Motion Quest',exact:true}).getByRole('link').click();
 await page.locator('.game-guide').getByRole('button',{name:'Share game',exact:true}).click();await expect(page.locator('.game-share-dialog textarea')).toHaveValue(/\/play\/motion-quest/);
 await page.keyboard.press('Escape');await expect(page.locator('.game-guide')).toBeVisible();
});

test('the shared invitation remains usable during fullscreen gameplay',async({page})=>{
 await setup(page);await page.goto('/play/plank-flight');const game=page.frameLocator('#game-frame');
 await game.locator('#demo').click();await game.locator('#fullscreen').click();await expect(game.locator('#fullscreen')).toHaveAttribute('aria-pressed','true');
 await game.getByRole('button',{name:'Share game',exact:true}).click();const dialog=game.locator('.game-share-dialog');await expect(dialog).toBeVisible();
 expect(await dialog.evaluate(el=>!el.ownerDocument.fullscreenElement||el.parentElement===el.ownerDocument.fullscreenElement)).toBe(true);
 await dialog.getByRole('button',{name:'Copy game link',exact:true}).click();expect(await dialog.evaluate(el=>el.ownerDocument.defaultView.gameInvitation)).toBe('https://fitness.integ.life/play/plank-flight?lang=en');
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await game.locator('#stop').click();
});
