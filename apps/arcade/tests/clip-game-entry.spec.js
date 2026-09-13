import {test, expect} from '@playwright/test';
import {games} from '../src/games.js';

for (const game of games.filter(game => game.kind === 'playable')) {
  test(`guests can play ${game.title} from a gallery card or shared clip`, async ({page}) => {
    const clip = {id:'ab125bc1-8659-4f6f-9889-b049e0247852', title:'Synthetic shared game', game:game.id, source:'synthetic', expiresAt:Date.now()+86400000};
    const loginRequests = [];
    page.on('request', request => { if (request.url().includes('/api/auth/start')) loginRequests.push(request.url()); });
    await page.route('**/api/auth/session', route => route.fulfill({json:{enabled:true,user:null,csrfToken:null}}));
    await page.route('**/api/clips', route => route.fulfill({json:{enabled:true,clips:[clip]}}));
    await page.route('**/api/clips/'+clip.id, route => route.fulfill({json:clip}));
    await page.route('**/api/media/'+clip.id, route => route.fulfill({status:404}));
    const name = 'Play '+game.title+' ↗';
    await page.goto('/gallery');
    await expect(page.getByRole('link',{name:'Watch clip →',exact:true})).toBeVisible();
    await page.getByRole('link',{name,exact:true}).click();
    await expect(page).toHaveURL('/play/'+game.id);
    await expect(page.locator('#game-frame')).toHaveAttribute('src',game.path);
    await expect(page.frameLocator('#game-frame').locator('body')).toBeVisible();

    await page.setViewportSize({width:390,height:844});
    await page.goto('/clips/'+clip.id);
    const play = page.getByRole('link',{name,exact:true});
    await expect(play).toBeInViewport();
    await expect(page.getByText('No login needed to play.',{exact:true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await play.click();
    await expect(page).toHaveURL('/play/'+game.id);
    await expect(page.locator('#game-frame')).toHaveAttribute('src',game.path);
    expect(loginRequests).toEqual([]);
    if (game.id === 'plank-flight') {
      const frame = page.frameLocator('#game-frame');
      await frame.getByRole('button',{name:'Try a demo'}).click();
      await expect(page.locator('#record-status')).toContainText('Recording');
    }
  });
}
