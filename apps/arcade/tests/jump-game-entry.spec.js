import {test,expect} from '@playwright/test';

test('Jump Game uses named links and instructions with left-hand confirmation',async({page})=>{
 await page.goto('/#arcade');
 const entry=page.getByRole('link',{name:'Play Jump Game',exact:true});
 await expect(entry).toHaveAttribute('href','/play/jump-game');await entry.click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.locator('.guide-setup')).not.toContainText('Confirm & continue');
 await expect(dialog.locator('.guide-setup')).toContainText('Raise your LEFT hand');
 await dialog.getByRole('link',{name:'Let’s play'}).click();
 await expect(page).toHaveURL('/play/jump-game');
 await expect(page.locator('#game-frame')).toHaveAttribute('src','/games/jump-game/');
 await expect(page.frameLocator('#game-frame').locator('.steps span')).toHaveText(['1 · Stand','2 · Confirm','3 · Jump']);
});

test('previous Jump Game URLs and shared clips still open the renamed game',async({page})=>{
 await page.goto('/play/camera-start?from=old#game');
 await expect(page).toHaveURL('/play/jump-game?from=old#game');
 await expect(page.locator('#game-frame')).toHaveAttribute('title','Jump Game game');
 await page.goto('/games/camera-start/');
 await expect(page).toHaveTitle('Jump Game');await expect(page.locator('#primary')).toHaveText('Enable camera');
 const clip={id:'ab125bc1-8659-4f6f-9889-b049e0247852',title:'Previous jump replay',game:'camera-start',source:'synthetic',expiresAt:null,visibility:'public',duration:1};
 await page.route('**/api/clips/'+clip.id,route=>route.fulfill({json:clip}));
 await page.route('**/api/media/'+clip.id,route=>route.fulfill({status:404}));
 await page.goto('/clips/'+clip.id);
 await expect(page.getByRole('link',{name:'Play Jump Game ↗',exact:true})).toHaveAttribute('href','/play/jump-game');
});
