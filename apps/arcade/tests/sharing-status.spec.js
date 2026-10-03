import {test,expect} from '@playwright/test';

async function fixture(page,{signedIn=false}={}){
 let clip=null,uploads=0,failNext=false;
 await page.route('**/api/config',route=>route.fulfill({json:{sharingEnabled:true,anonymous:{usedBytes:0,limitBytes:10e9},retentionOptions:['1','7','30','90','never']}}));
 await page.route('**/api/auth/session',route=>route.fulfill({json:{enabled:true,user:signedIn?{email:'synthetic@example.test'}:null,csrfToken:signedIn?'synthetic-csrf':null}}));
 await page.route('**/api/account/clips',route=>route.fulfill({json:{clips:clip?[{...clip,canDelete:true}]:[],usedBytes:clip?.bytes||0,limitBytes:2e9}}));
 await page.route('**/api/posters/*',route=>route.fulfill({json:{url:'/api/posters/synthetic'}}));
 await page.route('**/api/clips/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='PUT'){
   uploads++;clip={id:url.pathname.split('/').at(-1),title:url.searchParams.get('title'),source:'synthetic',game:'motion-quest',bytes:req.postDataBuffer().length,duration:1,createdAt:Date.now(),expiresAt:null,visibility:'public',publicationState:'published',legacy:!signedIn,canDelete:true,url:'/clips/'+url.pathname.split('/').at(-1)};
  }else if(req.method()==='PATCH'){
   if(failNext){failNext=false;await route.fulfill({status:503,json:{error:'Synthetic status update failure'}});return;}
   const next=req.postDataJSON().publicationState;
   expect(req.headers()['content-type']).toBe('application/json');
   if(signedIn)expect(req.headers()['x-csrf-token']).toBe('synthetic-csrf');
   else expect(req.headers()['x-management-key'].length).toBeGreaterThan(32);
   if(next==='published')expect(req.headers()['x-sharing-consent']).toBe('gallery-v1');
   clip.publicationState=next;
  }
  if(!clip){await route.fulfill({status:404,json:{error:'Unavailable'}});return;}
  await route.fulfill({json:clip});
 });
 return {uploads:()=>uploads,current:()=>clip,fail:()=>{failNext=true;}};
}
async function replay(page){
 await page.goto('/play/motion-quest');await page.frameLocator('#game-frame').locator('#demo').click();
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');await page.waitForTimeout(1000);
 await page.evaluate(()=>{const w=document.querySelector('#game-frame').contentWindow;w.motionQuest.getReplayState=()=>({roundId:w.document.documentElement.dataset.roundId,phase:'complete'});});
 await expect(page.locator('.clip-card')).toHaveCount(1);await page.goto('/library');
 return page.locator('.clip-card');
}
async function hash(page){
 return page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('fitness-pair-clips',1);r.onsuccess=()=>resolve(r.result);});
  const all=await new Promise(resolve=>{const tx=db.transaction('clips','readonly'),r=tx.objectStore('clips').getAll();r.onsuccess=()=>resolve(r.result);});db.close();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await all[0].blob.arrayBuffer()))].join(',');
 });
}
async function publish(card){
 await card.getByRole('button',{name:'Upload & share',exact:true}).click();
 await card.locator('[name=consent]').check();await card.getByRole('button',{name:'Upload this clip',exact:false}).click();
 await expect(card.getByRole('button',{name:'Pause public sharing',exact:true})).toBeVisible();
}

test('a replay stays local when Keep local only is chosen, including after reload',async({page})=>{
 const f=await fixture(page),card=await replay(page),before=await hash(page);
 await expect(card.locator('[data-clip-state]')).toHaveText('Saved locally · Not publicly shared');
 await card.getByRole('button',{name:'Upload & share',exact:true}).click();
 await card.getByRole('button',{name:'Keep local only',exact:true}).click();
 await expect(card.locator('form')).toHaveCount(0);expect(f.uploads()).toBe(0);
 await page.reload();await expect(page.locator('[data-clip-state]')).toHaveText('Saved locally · Not publicly shared');
 expect(await hash(page)).toBe(before);expect(f.uploads()).toBe(0);
});
test('anonymous local owners can pause, reload, inspect and restore without uploading again',async({page},info)=>{
 const f=await fixture(page),card=await replay(page),before=await hash(page);await publish(card);
 await card.getByRole('button',{name:'Pause public sharing',exact:true}).click();
 await expect(card.locator('[data-clip-state]')).toHaveText('Public sharing paused');
 await expect(card.getByRole('button',{name:'Resume public sharing',exact:true})).toBeVisible();
 expect(f.current().publicationState).toBe('paused');await page.reload();
 await expect(page.locator('[data-clip-state]')).toHaveText('Public sharing paused');
 await page.locator('#site-language').selectOption('zh');
 await expect(page.locator('[data-clip-state]')).toHaveText('公开分享已暂停');
 await expect(page.getByRole('button',{name:'恢复公开分享',exact:true})).toBeVisible();
 await page.locator('#site-language').selectOption('en');
 await page.goto('/clips/'+f.current().id);await expect(page.getByRole('button',{name:'Resume public sharing',exact:true})).toBeVisible();
 await expect(page.locator('.clip-view .share-message')).toHaveCount(0);await expect(page.locator('video')).not.toHaveAttribute('src');
 f.fail();await page.getByRole('button',{name:'Resume public sharing',exact:true}).click();
 await expect(page.locator('[data-publication-status]')).toHaveText('Synthetic status update failure');
 await expect(page.getByRole('button',{name:'Resume public sharing',exact:true})).toBeEnabled();
 expect(f.current().publicationState).toBe('paused');
 await page.getByRole('button',{name:'Resume public sharing',exact:true}).click();
 await expect(page.getByRole('button',{name:'Pause public sharing',exact:true})).toBeVisible();
 await page.goto('/library');await expect(page.locator('[data-clip-state]')).toHaveText('Public in the gallery');
 expect(f.uploads()).toBe(1);expect(await hash(page)).toBe(before);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('sharing-mobile.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('account inventory keeps paused clips and quota with reversible controls',async({page})=>{
 const f=await fixture(page,{signedIn:true}),card=await replay(page);await publish(card);
 await page.goto('/shared');const owned=page.locator('[data-owned-clips] .clip-card');
 const usage=await page.locator('.storage-summary strong').textContent();
 await owned.getByRole('button',{name:'Pause public sharing',exact:true}).click();
 await expect(owned.locator('[data-publication-label]')).toHaveText('Public sharing paused');
 await page.reload();await expect(page.locator('[data-publication-label]')).toHaveText('Public sharing paused');
 await expect(page.locator('.storage-summary strong')).toHaveText(usage);
 await page.getByRole('button',{name:'Resume public sharing',exact:true}).click();
 await expect(page.locator('[data-publication-label]')).toHaveText('Public in the gallery');
 expect(f.uploads()).toBe(1);
});
