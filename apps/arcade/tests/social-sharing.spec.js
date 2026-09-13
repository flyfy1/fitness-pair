import {test,expect} from '@playwright/test';
const id='c9125bc1-8659-4f6f-9889-b049e0247852';
const fixture={id,title:'Synthetic demo <clip>',game:'motion-quest',source:'synthetic',expiresAt:Date.UTC(2030,0,2)};
async function setup(page,visibility='public',blocked=false){
 await page.addInitScript(({blocked})=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(blocked)throw new Error('Denied');window.copied=text;}}});
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.sharedMessage=data;}});
 },{blocked});
 const clip={...fixture,visibility,url:'/clips/'+id+(visibility==='private'?'?share=synthetic%2Bfriend%3D':'')};
 await page.route('**/api/auth/session',r=>r.fulfill({json:{enabled:true,user:{email:'fixture@example.test'},csrfToken:'fixture'}}));
 await page.route('**/api/clips/'+id+'*',r=>r.fulfill({json:clip}));
 await page.route('**/api/posters/*',r=>r.fulfill({status:404}));
 return clip;
}
test('public clip shares a full message and opens platform URLs only after a click',async({page,context})=>{
 await setup(page);await page.goto('/clips/'+id);
 const panel=page.locator('.share-message');
 await panel.getByRole('button',{name:'Copy message',exact:true}).click();
 const copied=await page.evaluate(()=>window.copied);expect(copied).toContain(new URL('/clips/'+id,page.url()).href);expect(copied).toContain('2030-01-02');
 await panel.getByRole('button',{name:'Share',exact:true}).click();expect((await page.evaluate(()=>window.sharedMessage)).text).toBe(copied);
 const destinations=[];
 await context.route(/https:\/\/(www.linkedin.com|x.com|www.facebook.com)\//,r=>{destinations.push(r.request().url());return r.fulfill({body:'Synthetic platform composer boundary'});});
 for(const platform of ['LinkedIn','X (Twitter)','Facebook']){
  const link=panel.getByRole('link',{name:'Share on '+platform+' (opens a new tab)',exact:true});
  await expect(link).toHaveAttribute('rel','noopener noreferrer');
  const opened=context.waitForEvent('page');await link.click();const popup=await opened;await popup.waitForLoadState();
  expect(new URL(popup.url()).searchParams.get(platform==='Facebook'?'u':'url')).toBe(new URL('/clips/'+id,page.url()).href);await popup.close();
 }
 expect(destinations).toHaveLength(3);
});
test('private full link survives copying and native sharing; no social platform shortcuts',async({page})=>{
 await setup(page,'private');await page.goto('/clips/'+id+'?share=synthetic%2Bfriend%3D');
 const panel=page.locator('.share-message');await expect(panel.getByRole('link')).toHaveCount(0);
 await panel.getByRole('button',{name:'Copy link',exact:true}).click();expect(new URL(await page.evaluate(()=>window.copied)).searchParams.get('share')).toBe('synthetic+friend=');
 await panel.getByRole('button',{name:'Copy message',exact:true}).click();expect(await page.evaluate(()=>window.copied)).toContain('share=synthetic%2Bfriend%3D');
 await panel.getByRole('button',{name:'Share',exact:true}).click();expect((await page.evaluate(()=>window.sharedMessage)).text).toContain('please keep it between us');
});
test('blocked clipboard retains selectable full private text at mobile width',async({page})=>{
 await page.setViewportSize({width:320,height:740});await setup(page,'private',true);await page.goto('/clips/'+id+'?share=synthetic%2Bfriend%3D');
 await page.getByRole('button',{name:'Copy message',exact:true}).click();
 const field=page.getByLabel('Message to share');await expect(field).toBeFocused();
 expect(await field.evaluate(el=>el.selectionEnd-el.selectionStart)).toBe((await field.inputValue()).length);
 await expect(page.getByText('Select and copy the message above. Automatic copying is unavailable.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/fitness-social-mobile.png',fullPage:true});
});
test('local clip offers attachment text and private upload immediately offers the complete viewer message',async({page})=>{
 await setup(page,'private');await page.route('**/api/config',r=>r.fulfill({json:{sharingEnabled:true}}));
 await page.route('**/api/account/clips',r=>r.fulfill({json:{usedBytes:0,limitBytes:2e9,clips:[]}}));
 await page.route('**/api/posters/*',r=>r.fulfill({json:{}}));
 let uploads=0;
 await page.route('**/api/clips/'+id+'*',r=>{
  if(r.request().method()==='PUT'){uploads++;expect(r.request().headers()['x-sharing-consent']).toBe('private-v1');}
  return r.fulfill({json:{...fixture,visibility:'private',url:'/clips/'+id+'?share=synthetic%2Bfriend%3D'}});
 });
 await page.goto('/library');
 await page.evaluate(async clip=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('fitness-pair-clips',1);r.onupgradeneeded=()=>r.result.createObjectStore('clips',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
  await new Promise(resolve=>{const tx=db.transaction('clips','readwrite');tx.objectStore('clips').put({...clip,createdAt:Date.now(),duration:2,blob:new Blob(['synthetic bytes'],{type:'video/mp4'}),thumbnail:new Blob(['synthetic poster'],{type:'image/jpeg'})});tx.oncomplete=resolve;});db.close();
 },fixture);
 await page.reload();const card=page.locator('.clip-card');
 await card.getByRole('button',{name:'Copy message',exact:true}).click();expect(await page.evaluate(()=>window.copied)).toContain('attachment');expect(await page.evaluate(()=>window.copied)).not.toContain('/clips/');expect(uploads).toBe(0);
 await card.getByRole('button',{name:'Upload & share',exact:true}).click();await card.getByRole('combobox',{name:'Visibility',exact:true}).selectOption('private');await card.locator('input[name=consent]').check();
 await card.getByRole('button',{name:'Upload this clip',exact:false}).click();
 const uploaded=card.locator('[data-publish]');await expect(uploaded.getByRole('heading',{name:'Share privately with friends'})).toBeVisible();
 await uploaded.getByRole('button',{name:'Copy message',exact:true}).click();expect(await page.evaluate(()=>window.copied)).toContain('share=synthetic%2Bfriend%3D');expect(uploads).toBe(1);
});
