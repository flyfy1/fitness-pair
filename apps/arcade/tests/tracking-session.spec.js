import {test,expect} from '@playwright/test';
import {startWithHands} from '../../integ-ar/tests/start-hands.js';
import {syntheticCamera} from '../../integ-ar/tests/synthetic-camera.js';
import {arGames} from '../../integ-ar/src/catalog.js';
import {readStoredClip} from './read-stored-clip.js';

for(const config of arGames)test(`${config.id}: UUID links the camera replay and local skeleton sidecar`,async({page})=>{
 await syntheticCamera(page);await page.goto('/play/'+config.id);const game=page.frameLocator('#game-frame');
 if(config.slug==='invaders')await game.locator('#tutorial-skip').click();
 await game.locator('#start').click();await startWithHands(game);
 await expect(page.locator('#record-panel')).toHaveAttribute('data-state','recording');
 await page.waitForTimeout(500);await game.locator('#finish').click();
 await expect(page.locator('#local-result video')).toBeVisible({timeout:12000});
 const stored=await readStoredClip(page,config.id);
 expect(stored.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 expect(stored.inputSource.kind).toBe('camera');
 expect(stored.tracking).toMatchObject({format:'fitness-pair/tracking-session/1',sessionId:stored.sessionId,source:stored.inputSource});
 expect(stored.tracking.sampleCount).toBeGreaterThan(0);expect(stored.trackingBytes).toBeGreaterThan(0);
 expect(stored.tracking.sampleSessionIds).toEqual([stored.sessionId]);
 expect(stored.tracking.firstVideoMs).toBeGreaterThanOrEqual(0);
 expect(stored.tracking.lastVideoMs).toBeLessThanOrEqual(stored.tracking.durationMs+50);
});
