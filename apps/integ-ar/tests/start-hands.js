import {expect} from '@playwright/test';
export async function startWithHands(surface){
 await expect(surface.locator('.hands-start')).toBeVisible({timeout:12000});
 await surface.locator('body').evaluate(()=>{window.poseTest.hand='both';});
 await expect(surface.locator('.hands-start-title')).toContainText('lower both');
 await surface.locator('body').evaluate(()=>{window.poseTest.hand='down';});
}
