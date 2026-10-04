import { expect, test } from '@playwright/test';
import { createClient, latestEmail, nav, signUp, unique } from './helpers';

test('client → invoice with live totals → send with PDF → mark paid → dashboard', async ({
  page,
  request,
}) => {
  const { slug } = await signUp(page);
  const clientEmail = `billing+${unique()}@acme.test`;
  await createClient(page, slug, {
    name: 'Jordan Lee',
    company: 'Acme Robotics',
    email: clientEmail,
  });

  await page.getByRole('link', { name: 'New invoice' }).click();
  await page.getByLabel('Item 1 description').fill('Website design');
  await page.getByLabel('Item 1 unit price').fill('2500');
  await page.getByRole('button', { name: 'Add line item' }).click();
  await page.getByLabel('Item 2 description').fill('Development (hours)');
  await page.getByLabel('Item 2 quantity').fill('12.5');
  await page.getByLabel('Item 2 unit price').fill('90');
  await page.getByLabel('Tax rate').fill('10');
  await expect(page.getByText('$3,987.50')).toBeVisible(); // live total, computed like the server

  await page.getByRole('button', { name: 'Save & send' }).click();
  await expect(page.getByRole('heading', { name: 'INV-0001' })).toBeVisible();
  await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible();

  const email = await latestEmail(request);
  expect(email.to).toBe(clientEmail);
  expect(email.attachments[0]?.filename).toBe('INV-0001.pdf');

  // Sent invoices are immutable
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);

  // page.request shares the logged-in browser session's cookies
  const pdf = await page.request.get(
    `/api/orgs/${slug}/invoices/${page.url().split('/').pop()}/pdf`,
  );
  expect(pdf.headers()['content-type']).toBe('application/pdf');

  await page.getByRole('button', { name: 'Mark as paid' }).click();
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText('Recorded manually')).toBeVisible();

  await nav(page, 'Dashboard');
  await expect(page.getByText('$3,987.50').first()).toBeVisible();
});

test('the Free plan limits active clients to 3', async ({ page }) => {
  const { slug } = await signUp(page);
  for (const name of ['One', 'Two', 'Three'])
    await createClient(page, slug, { name, email: `${name}+${unique()}@x.test` });

  await page.goto(`/app/${slug}/clients`);
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByLabel('Contact name').fill('Four');
  await page.getByLabel('Billing email').fill(`four+${unique()}@x.test`);
  await page.getByRole('button', { name: 'Add client' }).click();
  await expect(page.getByText('Plan limit reached')).toBeVisible();
});
