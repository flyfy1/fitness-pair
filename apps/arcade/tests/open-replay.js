import {expect} from '@playwright/test';

// Media inspection starts through the same explicit action as a player.
export async function openReplay(video){
 if(await video.getAttribute('src'))return;
 await video.locator('..').getByRole('button',{name:/Play replay:/}).click();
 await expect.poll(()=>video.evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2);
 await video.evaluate(v=>v.pause());
}
