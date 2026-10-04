import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('sign up, log out and log back in to the same workspace', async ({ page }) => {
  const user = await signUp(page);
  await expect(page.getByRole('heading', { name: /, Alex$/ })).toBeVisible();

  await page.getByRole('button', { name: /Alex Morgan/ }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page.waitForURL(/\/login/);

  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.getByLabel('Work email').fill(user.email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Invalid email or password')).toBeVisible();

  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/${user.slug}$`));
});

test("another user can't open someone else's workspace", async ({ page, browser }) => {
  const alice = await signUp(page);

  const other = await browser.newPage();
  await signUp(other, { name: 'Eve Intruder' });
  await other.goto(`/app/${alice.slug}/invoices`);
  await expect(other.getByRole('heading', { name: 'Organization not found' })).toBeVisible();
  await other.close();
});

test('validation errors are shown inline', async ({ page }) => {
  await page.goto('/signup');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('alert')).toHaveCount(4);
});
