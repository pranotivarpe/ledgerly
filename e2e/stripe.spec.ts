import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

// Real Stripe test-mode checkout. Opt-in: STRIPE_E2E=1 npm run test:e2e
test.skip(!process.env.STRIPE_E2E, 'set STRIPE_E2E=1 to run against Stripe test mode');

test('upgrade to Pro through real Stripe Checkout', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Billing' }).click();
  await page.getByRole('button', { name: 'Upgrade to Pro' }).click();
  await page.waitForURL(/checkout\.stripe\.com/);
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('12 / 34');
  await page.locator('#cardCvc').fill('123');
  await page.locator('#billingName').fill('E2E Test');
  const zip = page.locator('#billingPostalCode');
  if (await zip.isVisible()) await zip.fill('94105');
  await page.locator('button[type=submit], .SubmitButton').first().click();
  await expect(page.getByText("You're on Pro!")).toBeVisible({ timeout: 60_000 });
});
