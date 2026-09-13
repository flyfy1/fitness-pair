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
  const opened=context.waitForEvent('page');await link.click();const popup=await opened;await expect(popup).toHaveURL(/https:\/\/(www.linkedin.com|x.com|www.facebook.com)\//);
  if(platform==='X (Twitter)')expect(new URL(popup.url()).searchParams.get('text')).toBe(copied);
  else{expect(new URL(popup.url()).searchParams.get(platform==='Facebook'?'u':'url')).toBe(new URL('/clips/'+id,page.url()).href);await expect(panel.getByRole('status')).toHaveText(`Message copied. Paste it into your ${platform} post, then review and publish there.`);}
  expect(await popup.evaluate(()=>window.opener)).toBeNull();await popup.close();
 }
 expect(destinations).toHaveLength(3);
 await page.locator('#site-language').selectOption('zh');
 await expect(panel.locator('textarea')).toHaveValue(/观看我的视频：/);
 const x=panel.locator('a[href*="x.com/intent"]');
 expect(new URL(await x.getAttribute('href')).searchParams.get('text')).toBe(await panel.locator('textarea').inputValue());
 await expect(panel.locator('a[href*="linkedin.com"]')).toHaveAttribute('title','点击复制消息，然后粘贴到你的 LinkedIn 帖子中。');
});
test('private full link survives copying and native sharing; no social platform shortcuts',async({page})=>{
 await setup(page,'private');await page.goto('/clips/'+id+'?share=synthetic%2Bfriend%3D');
 const panel=page.locator('.share-message');await expect(panel.getByRole('link')).toHaveCount(0);
 await panel.getByRole('button',{name:'Copy link',exact:true}).click();expect(new URL(await page.evaluate(()=>window.copied)).searchParams.get('share')).toBe('synthetic+friend=');
 await panel.getByRole('button',{name:'Copy message',exact:true}).click();expect(await page.evaluate(()=>window.copied)).toContain('share=synthetic%2Bfriend%3D');
 await panel.getByRole('button',{name:'Share',exact:true}).click();expect((await page.evaluate(()=>window.sharedMessage)).text).toContain('please keep it between us');
});
test('language changes refresh private messages while preserving the title, expiry and access token',async({page})=>{
 await setup(page,'private');await page.goto('/clips/'+id+'?share=synthetic%2Bfriend%3D');
 await page.locator('#site-language').selectOption('zh');
 const panel=page.locator('.share-message');
 await expect(panel.getByRole('heading',{name:'私密分享给朋友'})).toBeVisible();
 await expect(panel.locator('textarea')).toHaveValue(/观看我的视频：/);
 await expect(page.locator('main h1')).toHaveText(fixture.title);
 await panel.getByRole('button',{name:'复制消息',exact:true}).click();
 const copied=await page.evaluate(()=>window.copied);
 expect(copied).toContain('有效期至 2030-01-02');
 expect(copied).toContain('share=synthetic%2Bfriend%3D');
 expect(copied).toContain('请不要转发给其他人');
 await page.locator('#site-language').selectOption('en');
 await expect(panel.locator('textarea')).toHaveValue(/Watch my video:/);
 await panel.getByRole('button',{name:'Share',exact:true}).click();
 const shared=await page.evaluate(()=>window.sharedMessage);
 expect(shared.title).toBe(fixture.title);
 expect(new URL(shared.url).searchParams.get('share')).toBe('synthetic+friend=');
 expect(shared.text).toContain('Available until 2030-01-02');
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
 await setup(page,'private');await page.route('**/api/config',r=>r.fulfill({json:{sharingEnabled:true,retentionOptions:true}}));
 await page.route('**/api/account/clips',r=>r.fulfill({json:{usedBytes:0,limitBytes:2e9,clips:[]}}));
 await page.route('**/api/posters/*',r=>r.fulfill({json:{}}));
 let uploads=0;
 await page.route('**/api/clips/'+id+'*',r=>{
  if(r.request().method()==='PUT'){uploads++;expect(r.request().headers()['x-sharing-consent']).toBe('private-v1');}
  return r.fulfill({json:{...fixture,expiresAt:null,visibility:'private',url:'/clips/'+id+'?share=synthetic%2Bfriend%3D'}});
 });
 await page.goto('/library');
 await page.evaluate(async clip=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('fitness-pair-clips',1);r.onupgradeneeded=()=>r.result.createObjectStore('clips',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);});
  await new Promise(resolve=>{const tx=db.transaction('clips','readwrite');tx.objectStore('clips').put({...clip,createdAt:Date.now(),duration:2,blob:new Blob(['synthetic bytes'],{type:'video/mp4'}),thumbnail:new Blob(['synthetic poster'],{type:'image/jpeg'})});tx.oncomplete=resolve;});db.close();
 },fixture);
 await page.reload();const card=page.locator('.clip-card');
 await card.getByRole('button',{name:'Copy message',exact:true}).click();expect(await page.evaluate(()=>window.copied)).toContain('attachment');expect(await page.evaluate(()=>window.copied)).not.toContain('/clips/');expect(uploads).toBe(0);
 await page.locator('#site-language').selectOption('zh');
 await card.getByRole('button',{name:'上传并分享',exact:true}).click();
 await expect(card.getByText('每个视频最大可上传 200 MB。')).toBeVisible();
 await card.getByRole('combobox',{name:'有效期',exact:true}).selectOption('never');
 await expect(card.locator('select[name=retention] option:checked')).toHaveText('永不过期 · 保留到我删除为止');
 await card.locator('select[name=visibility]').selectOption('private');await card.locator('input[name=consent]').check();
 await card.locator('button[type=submit]').click();
 const uploaded=card.locator('[data-publish]');await expect(uploaded.getByRole('heading',{name:'私密分享给朋友'})).toBeVisible();
 await expect(uploaded.getByText('上传成功。',{exact:true})).toBeVisible();
 await expect(uploaded.getByText('永不过期',{exact:true})).toBeVisible();
 await uploaded.getByRole('button',{name:'复制消息',exact:true}).click();expect(await page.evaluate(()=>window.copied)).toContain('share=synthetic%2Bfriend%3D');expect(uploads).toBe(1);
});

test('blocked clipboard keeps the original page and provides manual copy guidance',async({page,context})=>{
 await setup(page,'public',true);
 await context.route('https://www.linkedin.com/**',r=>r.fulfill({body:'Synthetic LinkedIn composer boundary'}));
 await page.goto('/clips/'+id);const original=page.url();
 const opened=context.waitForEvent('page');
 await page.getByRole('link',{name:'Share on LinkedIn (opens a new tab)',exact:true}).click();
 const popup=await opened;await expect(popup).toHaveURL(/linkedin.com\/sharing\/share-offsite/);
 await expect(page.locator('.share-message [role=status]')).toHaveText('Automatic copying was unavailable. Copy the message above and paste it into your LinkedIn post.');
 await expect(page).toHaveURL(original);expect(await page.getByLabel('Message to share').inputValue()).toContain('/clips/'+id);
 await popup.close();
});
