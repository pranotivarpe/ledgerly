import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

export async function signUp(
  page: Page,
  opts: { name?: string; agency?: string; email?: string } = {},
) {
  const id = unique();
  const user = {
    name: opts.name ?? 'Alex Morgan',
    agency: opts.agency ?? `Northwind ${id}`,
    email: opts.email ?? `alex+${id}@e2e.test`,
    password: 'correct-horse-battery',
  };
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(user.name);
  await page.getByLabel('Agency name').fill(user.agency);
  await page.getByLabel('Work email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(/\/app\/[a-z0-9-]+$/);
  const slug = new URL(page.url()).pathname.split('/')[2]!;
  return { ...user, slug };
}

export const nav = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('link', { name }).click();

export async function createClient(
  page: Page,
  slug: string,
  client: { name: string; company?: string; email: string },
) {
  await page.goto(`/app/${slug}/clients`);
  await page.getByRole('button', { name: 'New client' }).first().click();
  await page.getByLabel('Contact name').fill(client.name);
  if (client.company) await page.getByLabel('Company').fill(client.company);
  await page.getByLabel('Billing email').fill(client.email);
  await page.getByRole('button', { name: 'Add client' }).click();
  await page.waitForURL(/\/clients\/[a-z0-9]+$/);
}

/** Latest email captured by the API's development outbox. */
export async function latestEmail(request: APIRequestContext) {
  const res = await request.get('/api/dev/emails/latest');
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments: { filename: string }[];
  };
}

export const portalLinkFrom = (text: string) =>
  text.match(/https?:\/\/[^\s]+\/portal\/[^\s]+\/verify\?token=[^\s)\]]+/)?.[0];
