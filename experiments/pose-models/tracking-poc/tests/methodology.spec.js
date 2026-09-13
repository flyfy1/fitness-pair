import { test, expect } from '@playwright/test';

test('method library filters real catalog data and exposes evidence without camera access', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.cameraCalls = 0; navigator.mediaDevices.getUserMedia = async () => { window.cameraCalls++; throw new Error('Overview must not request camera'); }; });
  await page.goto('/methodology/');
  await expect(page.locator('.method-card')).toHaveCount(8);
  await expect(page.locator('#result-count')).toHaveText('8 of 18 methods shown');
  await page.locator('#scenario').selectOption('desk');
  await expect(page.locator('.method-card')).toHaveCount(4);
  await page.locator('#layer').selectOption('Landmarks');
  await expect(page.locator('.method-card')).toHaveCount(2);
  await page.locator('[data-method="upper"] summary').click();
  await expect(page.locator('[data-method="upper"] details')).toContainText('same Pose Lite');
  await expect(page.locator('[data-method="upper"] details a').first()).toHaveAttribute('href', /github.com\/flyfy1\/fitness-pair\/blob\/7e2435b\//);
  await page.locator('#reset').click();
  await page.locator('[data-status="research"]').click();
  await expect(page.locator('.method-card')).toHaveCount(10);
  await page.locator('#search').fill('RTMO'); await expect(page.locator('.method-card')).toHaveCount(1);
  await page.locator('[data-method="rtmo"] summary').click();
  await expect(page.locator('[data-method="rtmo"]')).toContainText('no local demo implemented');
  await page.locator('#search').fill('not-a-method'); await expect(page.locator('#empty')).toBeVisible();
  await page.locator('#show-all').click(); await expect(page.locator('.method-card')).toHaveCount(18);
  await expect(page.locator('[data-method="torso"]')).toContainText('shoulder/elbow/wrist view alone omits the required hips');
  expect(await page.evaluate(() => window.cameraCalls)).toBe(0); expect(errors).toEqual([]);
});

test('comparison has a three-method bound, stays selected across filters and distinguishes layers', async ({ page }) => {
  await page.goto('/methodology/');
  await page.locator('[data-compare="pinch"]').click();
  await expect(page.locator('#selection-message')).toContainText('Three methods selected');
  await expect(page.locator('#selected button')).toHaveCount(3);
  await page.locator('[data-remove="full"]').click();
  await page.locator('[data-compare="pinch"]').click();
  await expect(page.locator('#layer-note')).toBeVisible();
  await expect(page.locator('.comparison')).toContainText('ratio below 0.3');
  await page.locator('[data-status="research"]').click();
  await expect(page.locator('#selected button')).toHaveCount(3);
  await expect(page.locator('.comparison')).toContainText('Thumb–index pinch');
  await page.locator('#clear').click();
  await expect(page.locator('#comparison-table')).toContainText('No methods selected');
  await page.locator('[data-compare="movenet"]').click();
  await expect(page.locator('.comparison')).toContainText('Research only');
  await expect(page.locator('.comparison')).toContainText('Not measured in this project');
});

test('production navigation and narrow layout preserve readable comparison', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Compare tracking methods' }).click();
  await expect(page).toHaveURL(/\/methodology\//);
  await page.screenshot({ path: 'test-results/methodology-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#scenario').selectOption('multi');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#guidance')).toContainText('not supported');
  await page.locator('[data-status="research"]').click(); await expect(page.locator('.method-card')).toHaveCount(1);
  await page.locator('#comparison').scrollIntoViewIfNeeded();
  const sizes = await page.locator('#comparison-table').evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
  expect(sizes.content).toBeGreaterThan(sizes.width);
  await page.locator('#comparison-table').evaluate(el => { el.scrollLeft = el.scrollWidth; });
  expect(await page.locator('#comparison-table').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/methodology-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Open live lab' }).click();
  await expect(page.locator('#start')).toBeVisible();
});
