import { test, expect } from '@playwright/test';

test('charge, spell flight and guardian impact are rendered on the replay canvas', async ({ page }) => {
  await page.goto('/');
  await page.locator('#demo').click();
  await page.locator('#demo-action').focus(); await page.keyboard.down('Space');
  await expect(page.locator('#charge-value')).toHaveText('100%');
  await expect(page.locator('#game')).toHaveAttribute('data-effect-phase', 'charge');
  await page.screenshot({ path: 'test-results/spell-charged.png' });
  const chargePixels = await page.locator('#game').evaluate(canvas => {
    const { width, height } = canvas, data = canvas.getContext('2d').getImageData(0,0,width,height).data;
    let count=0; for(let y=Math.floor(height*.3);y<height*.8;y++)for(let x=Math.floor(width*.3);x<width*.64;x++) {
      const i=(y*width+x)*4; if(data[i+3]>100&&data[i+1]>180)count++;
    } return count;
  });
  expect(chargePixels).toBeGreaterThan(8000);
  await page.keyboard.up('Space');
  await expect(page.locator('#rep-count')).toHaveText('1');
  await expect(page.locator('#game')).toHaveAttribute('data-effect-phase', 'projectile');
  await expect(page.locator('#game')).toHaveAttribute('data-effect-phase', 'impact');
  await page.screenshot({ path: 'test-results/spell-impact.png' });
  await expect(page.locator('#game')).toHaveAttribute('data-effect-phase', 'idle');
  await expect(page.locator('#rep-count')).toHaveText('1');
});

test('game sound is controllable and reduced motion retains readable attack feedback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const Context = window.AudioContext; window.soundNodes = 0;
    window.AudioContext = class extends Context { createOscillator() { window.soundNodes++; return super.createOscillator(); } };
  });
  await page.goto('/');
  const sound = page.getByRole('button', { name: 'Game sound', exact:true });
  await expect(sound).toHaveAttribute('aria-pressed','true');
  await sound.click(); await expect(sound).toHaveAttribute('aria-pressed','false');
  await sound.click(); await page.locator('#demo').click();
  await page.locator('#demo-action').focus(); await page.keyboard.down('Space');
  await expect(page.locator('#charge-value')).toHaveText('100%');
  await page.keyboard.up('Space');
  await expect(page.locator('#game')).toHaveAttribute('data-effect-phase','impact');
  expect(await page.evaluate(()=>window.soundNodes)).toBeGreaterThanOrEqual(7);
  await expect(page.locator('#game')).toHaveAttribute('data-effect-phase','idle');
  await sound.click(); await expect(sound).toHaveText('Sound off');
});
