import { expect, test } from '@playwright/test';

const noHorizontalScroll = () => document.documentElement.scrollWidth <= window.innerWidth;

for (const path of ['/', '/login', '/signup']) {
  test(`${path} fits a phone screen`, async ({ page }) => {
    await page.goto(path);
    expect(await page.evaluate(noHorizontalScroll)).toBe(true);
  });
}

test('demo dashboard and invoice fit a phone screen', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /Agency owner/ }).click();
  await expect(page.getByRole('heading', { name: 'Revenue' })).toBeVisible();
  expect(await page.evaluate(noHorizontalScroll)).toBe(true);

  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'Invoices' }).click();
  await page.locator('tbody tr').first().click();
  await expect(page.getByRole('heading', { name: /^INV-/ })).toBeVisible();
  expect(await page.evaluate(noHorizontalScroll)).toBe(true);
});
