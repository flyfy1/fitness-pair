import {test,expect} from '@playwright/test';
test.beforeEach(async({context})=>{await context.addCookies([{name:'hopmodo_session',value:'s'.repeat(43),url:'http://127.0.0.1:5194'}]);});
test('three feature games remain prominent and nine other games expand on demand',async({page},info)=>{
 await page.goto('/');await expect(page.getByText('Feature games',{exact:true})).toBeVisible();await expect(page.locator('.game-card:visible')).toHaveCount(3);await expect(page.locator('#other-games')).not.toHaveAttribute('open','');
 await page.locator('#other-games summary').click();await expect(page.locator('#other-games .game-card:visible')).toHaveCount(9);await expect(page.locator('#other-games a[href="/play/orbit-pop"]').first()).toBeVisible();
 await page.screenshot({path:info.outputPath('other-games-expanded.png'),fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('keyboard play persists once, stops without feedback and is visible to the protected admin report',async({page})=>{
 await page.goto('/play/dino-run');const game=page.frameLocator('#game-frame');await game.getByRole('button',{name:'Keyboard mode',exact:true}).click();await game.locator('#start').click();await page.waitForTimeout(600);await game.getByRole('button',{name:'Stop game',exact:true}).click();
 await expect.poll(async()=>{const r=await page.request.get('/api/admin/game-stats?game=dino-run');const data=await r.json();return data.sessions.filter(s=>s.status==='stopped').length;}).toBeGreaterThan(0);
 await page.goto('/admin/games');await expect(page.getByRole('heading',{name:'Game statistics'})).toBeVisible();await expect(page.locator('#stats-sessions')).toContainText('Dino Run');await expect(page.locator('#stats-sessions')).toContainText('stopped');await page.screenshot({path:'/tmp/hopmodo-stats/admin.png',fullPage:true});
});
test('concept play completes and standalone game entry records without double counting embedded play',async({page})=>{
 await page.goto('/play/orbit-pop');for(let i=0;i<10;i++)await page.locator('#pop-target').click();
 await expect.poll(async()=>{const data=await (await page.request.get('/api/admin/game-stats?game=orbit-pop')).json();return data.sessions.some(s=>s.status==='completed');}).toBe(true);
 await page.goto('/games/dino-run/');await page.getByRole('button',{name:'Keyboard mode',exact:true}).click();await page.locator('#start').click();
 await expect.poll(async()=>{const data=await (await page.request.get('/api/admin/game-stats?game=dino-run')).json();return data.sessions.length;}).toBe(2);
});

test('anonymous visitors cannot read the report and get a login link',async({browser})=>{
 const context=await browser.newContext();const page=await context.newPage();await page.goto('http://127.0.0.1:5194/admin/games');await expect(page.getByRole('link',{name:'Log in to view game statistics',exact:true})).toBeVisible();expect((await page.request.get('http://127.0.0.1:5194/api/admin/game-stats')).status()).toBe(401);await context.close();
});
