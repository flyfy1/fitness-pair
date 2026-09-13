import { test, expect } from '@playwright/test';

test('a timed keyboard jump clears a spawned cactus; losing focus pauses', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => 0.25; });
  await page.goto('/');
  await page.getByRole('button', {name: 'Keyboard mode'}).click();
  const width = await page.locator('#game').evaluate(canvas => { const r = canvas.getBoundingClientRect(); return r.width / Math.min(r.width / 480, r.height / 360); });
  // The first cactus spawns at 1.6s. Jump with its leading edge at x=200,
  // using its travel distance and the game's initial acceleration (2.4px/s²).
  const travel = width + 30 - 200;
  const spawnSpeed = 310 + 1.6 * 2.4;
  const approachSeconds = (Math.sqrt(spawnSpeed ** 2 + 4.8 * travel) - spawnSpeed) / 2.4;
  await page.keyboard.press('Space');
  await page.clock.runFor(Math.round((1.6 + approachSeconds) * 1000));
  await page.keyboard.press('ArrowUp');
  await page.clock.runFor(700);
  const state = await page.evaluate(() => window.dinoGame.getState());
  expect(state.status).toBe('running'); expect(state.passed).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => window.dinoGame.getState().status)).toBe('paused');
});

test('keyboard run, jump, pause, collision, restart and best persistence', async ({ page }) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await page.getByRole('button', {name: 'Keyboard mode'}).click(); await expect(page.getByRole('button',{name:'Let’s run'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/desktop-ready.png'});
  await page.keyboard.press('Space');
  await expect.poll(()=>page.evaluate(()=>window.dinoGame.getState().status)).toBe('running');
  await page.keyboard.press('ArrowUp');
  await expect.poll(()=>page.evaluate(()=>window.dinoGame.getState().airborne)).toBe(true);
  await page.keyboard.press('KeyP');
  const frozen=await page.evaluate(()=>window.dinoGame.getState());
  await page.waitForTimeout(250); expect(await page.evaluate(()=>window.dinoGame.getState())).toEqual(frozen);
  await page.getByRole('button',{name:'Keep running'}).click();
  await expect.poll(()=>page.evaluate(()=>window.dinoGame.getState().status),{timeout:10000}).toBe('over');
  const best=await page.evaluate(()=>window.dinoGame.getState().best);expect(best).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/desktop-over.png'});
  await page.getByRole('button',{name:'Run again'}).click();
  expect(await page.evaluate(()=>window.dinoGame.getState().status)).toBe('running');
  await page.reload(); await page.getByRole('button', {name: 'Keyboard mode'}).click(); expect(await page.evaluate(()=>window.dinoGame.getState().best)).toBe(best);
  expect(errors).toEqual([]);
});

test('touch play on narrow screen and external motion command use same game', async ({ browser }) => {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();await page.goto('/');
  await page.getByRole('button', {name: 'Keyboard mode'}).tap();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/mobile-ready.png', fullPage:true});
  await page.getByRole('button',{name:'Let’s run'}).tap();
  await page.getByRole('button',{name:'↑ Jump TAP TO JUMP'}).tap();
  expect(await page.evaluate(()=>window.dinoGame.getState().jumps)).toBe(1);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('fitness:action',{detail:{action:'jump'}})));
  expect(await page.evaluate(()=>window.dinoGame.getState().jumps)).toBe(1);
  await expect.poll(()=>page.evaluate(()=>window.dinoGame.getState().airborne)).toBe(false);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('fitness:action',{detail:{action:'jump'}})));
  expect(await page.evaluate(()=>window.dinoGame.getState().jumps)).toBe(2);
  await page.getByRole('button',{name:'Pause game'}).tap();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('fitness:action',{detail:{action:'jump'}})));
  expect(await page.evaluate(()=>window.dinoGame.getState().status)).toBe('paused');
  await page.screenshot({path:'test-results/mobile-paused.png', fullPage:true});
  await context.close();
});
