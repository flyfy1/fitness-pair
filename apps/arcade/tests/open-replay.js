import {expect} from '@playwright/test';

// Media inspection starts through the same explicit action as a player.
export async function openReplay(video){
 const feedback=video.locator('xpath=ancestor::main//*[@data-view-replay]');
 if(await feedback.isVisible().catch(()=>false))await feedback.click();
 if(await video.getAttribute('src'))return;
 await video.locator('..').locator('button.clip-preview-play').click();
 await expect.poll(()=>video.evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
 await video.evaluate(v=>v.pause());
}
