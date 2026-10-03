import {expect} from '@playwright/test';

// Exercise the retained game's real synthetic controls without requesting a camera.
export async function startPreview(page, game) {
 const feedback=page.locator('[data-view-replay]');
 if(await feedback.isVisible())await feedback.click();
 const back=page.getByRole('button',{name:'Back to game',exact:true}).first();
 if(await back.isVisible())await back.click();
 const again=game.locator('#again');
 await (await again.isVisible()?again:game.locator('#demo')).click();
}
export async function finishPreview(page, game) {
 for(let i=0;i<5;i++)await game.locator('#demo-action').press('Space',{delay:750});
 await expect(game.locator('#victory')).toBeVisible({timeout:7000});
 await expect(page.locator('[data-view-replay]')).toBeVisible();
 await page.locator('[data-view-replay]').click();
}
