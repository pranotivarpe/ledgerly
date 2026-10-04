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
