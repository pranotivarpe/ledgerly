import { expect, test } from '@playwright/test';
import { createClient, latestEmail, portalLinkFrom, signUp, unique } from './helpers';

test("the invoice email's pay link signs the client into the portal", async ({
  page,
  browser,
  request,
}) => {
  const { slug } = await signUp(page);
  const clientEmail = `jordan+${unique()}@acme.test`;
  await createClient(page, slug, {
    name: 'Jordan Lee',
    company: 'Acme Robotics',
    email: clientEmail,
  });
  await page.getByRole('link', { name: 'New invoice' }).click();
  await page.getByLabel('Item 1 description').fill('Website design');
  await page.getByLabel('Item 1 unit price').fill('1250');
  await page.getByRole('button', { name: 'Save & send' }).click();
  await expect(page.getByRole('heading', { name: 'INV-0001' })).toBeVisible();

  const link = portalLinkFrom((await latestEmail(request)).text);
  expect(link).toBeTruthy();

  const client = await browser.newPage();
  await client.goto(link!);
  await expect(client.getByRole('heading', { name: 'INV-0001' })).toBeVisible();
  await expect(client.getByRole('button', { name: /Pay \$1,250\.00/ })).toBeVisible();

  // Links are single-use: after signing out, the same link is rejected
  await client.getByRole('button', { name: 'Sign out' }).click();
  await client.goto(link!);
  await expect(client.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  await client.close();
});

test("the portal doesn't reveal who is a client", async ({ page }) => {
  const { slug } = await signUp(page);
  await page.goto(`/portal/${slug}`);
  await page.getByLabel('Email address').fill('stranger@nowhere.test');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
});
