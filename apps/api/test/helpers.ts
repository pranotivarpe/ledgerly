import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

export const app = createApp();
export const ORIGIN = process.env.WEB_URL ?? 'http://localhost:5180';

/** Wipes every table between tests (fast enough at this size, and fully isolates tests). */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;

/** Signs up a fresh user + organization and returns a cookie-carrying agent. */
export async function signUp(
  overrides: Partial<Record<'name' | 'email' | 'organizationName', string>> = {},
) {
  counter += 1;
  const body = {
    name: `User ${counter}`,
    email: `user${counter}@example.com`,
    organizationName: `Agency ${counter}`,
    password: 'correct-horse-battery',
    ...overrides,
  };
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/signup').set('Origin', ORIGIN).send(body);
  if (res.status !== 201)
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, body, user: res.body.user, org: res.body.organizations[0] };
}

/** Extracts a cookie value from a Set-Cookie header array. */
export function getCookie(setCookie: string[] | string | undefined, name: string) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = list.find((c) => c.startsWith(`${name}=`));
  return match?.split(';')[0]?.slice(name.length + 1);
}

/** Pulls the invitation token out of the most recent email in the dev outbox. */
export async function latestInviteToken() {
  const { getOutbox } = await import('../src/lib/email.js');
  const email = getOutbox()[0];
  const token = email?.text.match(/\/invite\/([A-Za-z0-9_-]+)/)?.[1];
  if (!token) throw new Error('No invitation email found');
  return { token, email: email! };
}

export async function setPlan(orgId: string, plan: 'FREE' | 'PRO' | 'TEAM') {
  await prisma.organization.update({ where: { id: orgId }, data: { plan } });
}

export async function createClient(
  agent: request.Agent,
  slug: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await agent
    .post(`/api/orgs/${slug}/clients`)
    .set('Origin', ORIGIN)
    .send({
      name: 'Acme Robotics',
      email: 'billing@acme.test',
      company: 'Acme Robotics Inc.',
      ...overrides,
    });
  if (res.status !== 201)
    throw new Error(`create client failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.client as { id: string; name: string };
}

export function invoiceBody(clientId: string, overrides: Record<string, unknown> = {}) {
  return {
    clientId,
    issueDate: '2026-10-01',
    dueDate: '2099-10-31',
    taxRateBps: 1000,
    notes: 'Thanks for your business',
    items: [
      { description: 'Website design', quantity: 1, unitPriceCents: 250_000 },
      { description: 'Development (hours)', quantity: 12.5, unitPriceCents: 9_000 },
    ],
    ...overrides,
  };
}

export async function createInvoice(
  agent: request.Agent,
  slug: string,
  clientId: string,
  overrides = {},
) {
  const res = await agent
    .post(`/api/orgs/${slug}/invoices`)
    .set('Origin', ORIGIN)
    .send(invoiceBody(clientId, overrides));
  if (res.status !== 201)
    throw new Error(`create invoice failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.invoice as { id: string; number: string; totalCents: number; status: string };
}
