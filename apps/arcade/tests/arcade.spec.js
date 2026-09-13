import {test,expect} from '@playwright/test';
test('landing has a direct arcade path and a factual build story',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByRole('heading',{name:'GAMES THAT GET YOU MOVING.'})).toBeVisible();
 await page.getByRole('link',{name:'Take me to the arcade',exact:true}).first().click();await expect(page).toHaveURL(/#arcade$/);
 await expect(page.getByRole('link',{name:'Play Dino Run',exact:true})).toBeInViewport();
 await page.getByRole('link',{name:'How we built it',exact:true}).click();await expect(page.getByRole('heading',{name:'BUILDING THE ARCADE WITH ASTRA.'})).toBeInViewport();
 expect(errors).toEqual([]);
});
test('mobile layout fits and reduced motion starts paused',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 await expect(page.getByRole('button',{name:'Play motion',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('link',{name:'Take me to the arcade',exact:true}).first()).toBeInViewport();
});
test('concept is labeled and can complete with a keyboard',async({page})=>{
 await page.goto('/play/orbit-pop');await expect(page.getByText('Interactive concept · button simulation · no camera')).toBeVisible();
 const target=page.getByRole('button',{name:'Pop the orbit',exact:true});for(let i=0;i<10;i++)await target.press('Enter');
 await expect(page.getByText(/Ten pops/)).toBeVisible();await page.getByRole('button',{name:'Start again'}).click();await expect(target).toBeVisible();await expect(page.locator('#pop-score')).toHaveText('0');
});
test('Dino launches keyboard play without camera or automatic recording',async({page})=>{
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');
 await expect(page.getByRole('button',{name:'Record game + camera',exact:true})).toBeEnabled();
 await expect(page.locator('#record-status')).toContainText('Recording is off');
 await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();
 await expect(game.locator('#pause')).toBeEnabled();await game.locator('#pause').click();
 await expect.poll(()=>page.evaluate(()=>document.querySelector('#game-frame').contentWindow.dinoGame.getState().status)).toBe('paused');
 expect(await page.evaluate(()=>document.querySelector('#game-frame').contentDocument.querySelector('#camera').srcObject===null)).toBe(true);
});
test('synthetic Motion Quest recording saves locally, survives reload, and never uploads',async({page})=>{
 const uploads=[];page.on('request',r=>{if(r.method()==='PUT')uploads.push(r.url());});await page.goto('/play/motion-quest');const game=page.frameLocator('#game-frame');
 await game.locator('#demo').click();await page.getByRole('button',{name:'Record game + camera',exact:true}).click();
 await expect(page.locator('#record-status')).toContainText('Recording');
 for(let i=0;i<5;i++){await game.locator('#demo-action').focus();await page.keyboard.down('Space');await page.waitForTimeout(750);await page.keyboard.up('Space');}
 await expect(game.locator('#rep-count')).toHaveText('5');await expect(page.locator('#record-status')).toContainText('Saved on this device',{timeout:12000});
 await expect(page.locator('#local-result video')).toBeVisible();
 await page.goto('/library');await expect(page.getByRole('heading',{name:'Motion Quest · my move'})).toBeVisible();
 await page.reload();await expect(page.locator('video')).toHaveCount(1);await page.locator('video').evaluate(v=>v.play());await expect.poll(()=>page.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Share to gallery'}).click();await expect(page.getByText(/Gallery sharing isn’t available yet/)).toBeVisible();expect(uploads).toEqual([]);
 await page.getByRole('button',{name:'Delete local clip'}).click();await expect(page.locator('video')).toHaveCount(0);
});
test('gallery and missing clips have usable honest states',async({page})=>{
 await page.goto('/gallery');await expect(page.getByRole('heading',{name:'SHARING IS COMING SOON.'})).toBeVisible();await expect(page.locator('video')).toHaveCount(0);
 await page.goto('/clips/550e8400-e29b-41d4-a716-446655440000');await expect(page.getByRole('heading',{name:'CLIP UNAVAILABLE.'})).toBeVisible();
});
