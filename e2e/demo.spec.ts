import { expect, test } from '@playwright/test';

// Requires the demo workspace (npm run db:seed, or DEMO_ENABLED on a running server).

test('one-click demo as owner: banner shown, billing locked', async ({ page }) => {
  await page.goto('/login?demo=1');
  await page.getByRole('button', { name: /Agency owner/ }).click();
  await expect(page).toHaveURL(/\/app\/northwind$/);
  await expect(page.getByText("You're exploring a demo workspace")).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revenue' })).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Billing' }).click();
  await expect(page.getByText('Billing is disabled in the demo workspace')).toBeVisible();
});

test('one-click demo of the client portal', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /Client portal/ }).click();
  await expect(page).toHaveURL(/\/portal\/northwind\/invoices$/);
  await expect(page.getByText('Outstanding balance')).toBeVisible();
});
