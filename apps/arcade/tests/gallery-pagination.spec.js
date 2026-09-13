import {test,expect} from '@playwright/test';

test('an empty enabled gallery page keeps its next-page link; disabled sharing stays closed',async({page})=>{
 let enabled=true;
 await page.route('**/api/clips*',route=>{
  const next=new URL(route.request().url()).searchParams.get('page')==='next token';
  return route.fulfill({json:{enabled,clips:next?[{id:'synthetic-clip',title:'Synthetic shared fixture',source:'synthetic'}]:[],nextPageToken:next?null:'next token'}});
 });
 await page.goto('/gallery');
 await expect(page.getByRole('heading',{name:'NO CLIPS ON THIS PAGE.'})).toBeVisible();
 await page.getByRole('link',{name:'More clips'}).click();
 await expect(page).toHaveURL(/page=next%20token/);
 await expect(page.getByRole('heading',{name:'Synthetic shared fixture'})).toBeVisible();
 await expect(page.getByRole('link',{name:'More clips'})).toHaveCount(0);
 enabled=false;await page.goto('/gallery');
 await expect(page.getByRole('heading',{name:'SHARING IS COMING SOON.'})).toBeVisible();
 await expect(page.getByRole('link',{name:'More clips'})).toHaveCount(0);
});
