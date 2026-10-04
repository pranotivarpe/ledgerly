import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDemo } from '../src/demo/seed-demo.js';
import { clearOutbox, getOutbox } from '../src/lib/email.js';
import { prisma } from '../src/lib/prisma.js';
import { app, createClient, createInvoice, ORIGIN, resetDb, signUp } from './helpers.js';

beforeEach(async () => {
  await resetDb();
  await seedDemo(prisma);
  clearOutbox();
});

async function demoLogin(role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'OWNER') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/demo').set('Origin', ORIGIN).send({ role });
  expect(res.status).toBe(200);
  return { agent, slug: res.body.organization.slug as string };
}

describe('public demo', () => {
  it('one-click login as each role lands in the shared demo workspace', async () => {
    for (const role of ['OWNER', 'ADMIN', 'MEMBER'] as const) {
      const { agent, slug } = await demoLogin(role);
      const org = await agent.get(`/api/orgs/${slug}`);
      expect(org.body.organization).toMatchObject({
        slug: 'northwind',
        role,
        isDemo: true,
        plan: 'TEAM',
      });
    }
  });

  it('the seeded workspace has realistic data', async () => {
    const { agent, slug } = await demoLogin();
    const dash = await agent.get(`/api/orgs/${slug}/dashboard`);
    expect(dash.body.stats.overdueCount).toBeGreaterThan(0);
    expect(
      dash.body.revenueByMonth.filter((m: { totalCents: number }) => m.totalCents > 0).length,
    ).toBeGreaterThan(8);
    expect(dash.body.topClients[0].name).toBeTruthy();
  });

  it('blocks actions that would affect other visitors', async () => {
    const { agent, slug } = await demoLogin();
    const members = await agent.get(`/api/orgs/${slug}/members`);
    const sam = members.body.members.find((m: { role: string }) => m.role === 'MEMBER');
    const clients = await agent.get(`/api/orgs/${slug}/clients`);

    const attempts = [
      agent.patch(`/api/orgs/${slug}`).set('Origin', ORIGIN).send({ name: 'Hacked' }),
      agent
        .post(`/api/orgs/${slug}/invitations`)
        .set('Origin', ORIGIN)
        .send({ email: 'x@spam.test' }),
      agent
        .patch(`/api/orgs/${slug}/members/${sam.id}`)
        .set('Origin', ORIGIN)
        .send({ role: 'ADMIN' }),
      agent.delete(`/api/orgs/${slug}/members/${sam.id}`).set('Origin', ORIGIN),
      agent.post(`/api/orgs/${slug}/billing/checkout`).set('Origin', ORIGIN).send({ plan: 'PRO' }),
      agent.post(`/api/orgs/${slug}/billing/portal`).set('Origin', ORIGIN),
      agent.delete(`/api/orgs/${slug}/clients/${clients.body.clients[0].id}`).set('Origin', ORIGIN),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DEMO_READONLY');
    }
    expect((await prisma.organization.findFirstOrThrow({ where: { isDemo: true } })).name).toBe(
      'Northwind Studio',
    );
  });

  it('normal work is allowed, and emails are captured but not delivered', async () => {
    const { agent, slug } = await demoLogin('MEMBER');
    const client = await createClient(agent, slug, { email: 'someone-real@gmail.com' });
    const inv = await createInvoice(agent, slug, client.id);
    expect(
      (await agent.post(`/api/orgs/${slug}/invoices/${inv.id}/send`).set('Origin', ORIGIN)).status,
    ).toBe(200);
    expect(getOutbox()[0]!.to).toBe('someone-real@gmail.com'); // in the dev outbox only
  });

  it('client portal demo signs in as the sample client', async () => {
    const agent = request.agent(app);
    await agent.post('/api/portal/northwind/demo').set('Origin', ORIGIN).expect(200);
    const res = await agent.get('/api/portal/northwind/invoices');
    expect(res.status).toBe(200);
    expect(res.body.invoices.length).toBeGreaterThan(0);
  });

  it("portal demo login doesn't work for real agencies", async () => {
    const real = await signUp();
    expect(
      (await request(app).post(`/api/portal/${real.org.slug}/demo`).set('Origin', ORIGIN)).status,
    ).toBe(404);
  });

  it('the reset job restores the demo', async () => {
    const { agent, slug } = await demoLogin();
    await createClient(agent, slug, { name: 'Visitor junk' });
    await request(app)
      .post('/api/jobs/reset-demo')
      .set('Authorization', 'Bearer test-cron-secret-123456')
      .expect(200);
    expect(await prisma.client.count({ where: { organization: { isDemo: true } } })).toBe(8);
  });
});
