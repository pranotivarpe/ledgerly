import request from 'supertest';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runOverdueReminders } from '../src/jobs/overdue-reminders.js';
import { clearOutbox, getOutbox } from '../src/lib/email.js';
import { prisma } from '../src/lib/prisma.js';
import { stripe } from '../src/lib/stripe.js';
import { revenueByMonth, topClients } from '../src/services/revenue.service.js';
import { app, createClient, createInvoice, ORIGIN, resetDb, setPlan, signUp } from './helpers.js';

beforeEach(async () => {
  await resetDb();
  clearOutbox();
});
afterEach(() => vi.restoreAllMocks());

const DAY = 24 * 60 * 60 * 1000;
const subjects = () => getOutbox().map((e) => `${e.to} | ${e.subject}`);

function signedWebhook(type: string, object: unknown, id: string) {
  const payload = JSON.stringify({ id, object: 'event', type, data: { object } });
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
  return request(app)
    .post('/api/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', sig)
    .send(payload);
}

describe('transactional emails', () => {
  it('sends a welcome email on signup, but not when joining via an invite', async () => {
    const owner = await signUp({ email: 'founder@agency.test' });
    expect(subjects()).toContain(
      `founder@agency.test | Welcome to Ledgerly — ${owner.org.name} is ready`,
    );

    await setPlan(owner.org.id, 'PRO');
    clearOutbox();
    await owner.agent
      .post(`/api/orgs/${owner.org.slug}/invitations`)
      .set('Origin', ORIGIN)
      .send({ email: 'new@agency.test' });
    const token = getOutbox()[0]!.text.match(/\/invite\/([\w-]+)/)![1];
    clearOutbox();
    await request(app)
      .post('/api/auth/signup')
      .set('Origin', ORIGIN)
      .send({
        name: 'New',
        email: 'new@agency.test',
        password: 'new-password-1',
        inviteToken: token,
      })
      .expect(201);
    expect(getOutbox()).toHaveLength(0);
  });

  it('an online payment emails the client a receipt and owners/admins a notification — once', async () => {
    const owner = await signUp({ email: 'owner@agency.test' });
    await setPlan(owner.org.id, 'TEAM');
    for (const [email, role] of [
      ['admin@agency.test', 'ADMIN'],
      ['member@agency.test', 'MEMBER'],
    ] as const) {
      const u = await signUp({ email });
      await prisma.membership.create({
        data: { userId: u.user.id, organizationId: owner.org.id, role },
      });
    }
    const client = await createClient(owner.agent, owner.org.slug, { email: 'pay@acme.test' });
    const inv = await createInvoice(owner.agent, owner.org.slug, client.id);
    await owner.agent
      .post(`/api/orgs/${owner.org.slug}/invoices/${inv.id}/send`)
      .set('Origin', ORIGIN)
      .expect(200);
    clearOutbox();

    const session = {
      id: 'cs_paid',
      object: 'checkout.session',
      mode: 'payment',
      payment_status: 'paid',
      payment_intent: 'pi_receipt',
      amount_total: inv.totalCents,
      currency: 'usd',
      metadata: { kind: 'invoice', invoiceId: inv.id, organizationId: owner.org.id },
    } as unknown as Stripe.Checkout.Session;
    await signedWebhook('checkout.session.completed', session, 'evt_a').expect(200);
    await signedWebhook('checkout.session.completed', session, 'evt_b').expect(200); // different event, same payment

    const sent = subjects();
    expect(sent).toHaveLength(3);
    expect(sent).toContainEqual(
      expect.stringMatching(/^pay@acme\.test \| Receipt: \$3,987\.50 paid to/),
    );
    expect(sent).toContainEqual(
      expect.stringMatching(/^owner@agency\.test \| 💸 .* paid \$3,987\.50/),
    );
    expect(sent).toContainEqual(expect.stringMatching(/^admin@agency\.test \| 💸/));
    expect(sent.some((s) => s.startsWith('member@'))).toBe(false);
  });

  it('a failed subscription payment emails the owners', async () => {
    const owner = await signUp({ email: 'boss@agency.test' });
    await prisma.organization.update({
      where: { id: owner.org.id },
      data: { stripeCustomerId: 'cus_fail' },
    });
    clearOutbox();
    await signedWebhook(
      'invoice.payment_failed',
      {
        id: 'in_1',
        object: 'invoice',
        customer: 'cus_fail',
        amount_due: 1900,
        currency: 'usd',
        attempt_count: 1,
      },
      'evt_fail',
    ).expect(200);
    expect(subjects()).toEqual([
      'boss@agency.test | Action needed: your Ledgerly payment of $19.00 failed',
    ]);
  });
});

describe('overdue reminders job', () => {
  async function overdueInvoice(
    plan: 'FREE' | 'PRO' = 'PRO',
    opts: { dueDaysAgo?: number; sentDaysAgo?: number } = {},
  ) {
    const owner = await signUp();
    await setPlan(owner.org.id, plan);
    const client = await createClient(owner.agent, owner.org.slug, {
      email: `late+${Math.random()}@client.test`,
    });
    const inv = await createInvoice(owner.agent, owner.org.slug, client.id, {
      issueDate: '2026-01-01',
      dueDate: new Date(Date.now() - (opts.dueDaysAgo ?? 10) * DAY).toISOString().slice(0, 10),
    });
    await owner.agent
      .post(`/api/orgs/${owner.org.slug}/invoices/${inv.id}/send`)
      .set('Origin', ORIGIN)
      .expect(200);
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { sentAt: new Date(Date.now() - (opts.sentDaysAgo ?? 7) * DAY), lastReminderAt: null },
    });
    clearOutbox();
    return { owner, inv, client };
  }

  it('reminds clients about overdue invoices with the PDF and a pay link', async () => {
    const { inv } = await overdueInvoice();
    const result = await runOverdueReminders();
    expect(result.sent).toBe(1);

    const [email] = getOutbox();
    expect(email!.subject).toMatch(/^Reminder: invoice INV-0001 from .* is overdue$/);
    expect(email!.html).toContain('View &amp; pay invoice');
    expect(email!.attachments[0]!.filename).toBe('INV-0001.pdf');
    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).lastReminderAt,
    ).not.toBeNull();
    expect(await prisma.activityLog.count({ where: { action: 'invoice.reminder_sent' } })).toBe(1);
  });

  it('waits 3 days between reminders', async () => {
    const { inv } = await overdueInvoice();
    await runOverdueReminders();
    expect((await runOverdueReminders()).sent).toBe(0);

    await prisma.invoice.update({
      where: { id: inv.id },
      data: { lastReminderAt: new Date(Date.now() - 4 * DAY) },
    });
    expect((await runOverdueReminders()).sent).toBe(1);
  });

  it('skips Free plans, freshly sent invoices and invoices overdue for more than 60 days', async () => {
    await overdueInvoice('FREE');
    await overdueInvoice('PRO', { sentDaysAgo: 1 });
    await overdueInvoice('PRO', { dueDaysAgo: 90 });
    expect((await runOverdueReminders()).sent).toBe(0);
  });

  it('never double-sends when two workers run at the same time', async () => {
    await overdueInvoice();
    await overdueInvoice();
    const [a, b] = await Promise.all([runOverdueReminders(), runOverdueReminders()]);
    expect(a.sent + b.sent).toBe(2);
    expect(getOutbox()).toHaveLength(2);
  });

  it('marks sent invoices overdue as part of the run', async () => {
    const owner = await signUp();
    const client = await createClient(owner.agent, owner.org.slug);
    const inv = await createInvoice(owner.agent, owner.org.slug, client.id);
    await owner.agent
      .post(`/api/orgs/${owner.org.slug}/invoices/${inv.id}/send`)
      .set('Origin', ORIGIN)
      .expect(200);
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { dueDate: new Date(Date.now() - 2 * DAY) },
    });
    expect((await runOverdueReminders()).markedOverdue).toBe(1);
  });

  it('cron endpoint requires the secret', async () => {
    expect((await request(app).post('/api/jobs/overdue-reminders')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/jobs/overdue-reminders')
          .set('Authorization', 'Bearer wrong-secret-0000000')
      ).status,
    ).toBe(401);
    const ok = await request(app)
      .post('/api/jobs/overdue-reminders')
      .set('Authorization', 'Bearer test-cron-secret-123456');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ sent: 0 });
  });
});

describe('revenue analytics', () => {
  it('returns 12 zero-filled months and ranks clients, scoped to one organization', async () => {
    const owner = await signUp();
    const acme = await createClient(owner.agent, owner.org.slug, { name: 'Acme' });
    const fern = await createClient(owner.agent, owner.org.slug, { name: 'Fern', company: null });
    const a = await createInvoice(owner.agent, owner.org.slug, acme.id);
    const f = await createInvoice(owner.agent, owner.org.slug, fern.id);

    const now = new Date('2026-10-15T12:00:00Z');
    const pay = (invoiceId: string, cents: number, iso: string, orgId = owner.org.id) =>
      prisma.payment.create({
        data: {
          organizationId: orgId,
          invoiceId,
          amountCents: cents,
          currency: 'USD',
          method: 'MANUAL',
          paidAt: new Date(iso),
        },
      });
    await pay(a.id, 100_000, '2026-10-02T00:00:00Z');
    await pay(a.id, 50_000, '2026-08-20T00:00:00Z');
    await pay(f.id, 70_000, '2026-10-10T00:00:00Z');
    await pay(f.id, 999_999, '2025-09-30T00:00:00Z'); // outside the 12-month window

    // Another org's payment must not leak in
    const other = await signUp();
    const oc = await createClient(other.agent, other.org.slug);
    const oi = await createInvoice(other.agent, other.org.slug, oc.id);
    await pay(oi.id, 5_000_000, '2026-10-05T00:00:00Z', other.org.id);

    const months = await revenueByMonth(owner.org.id, 12, now);
    expect(months).toHaveLength(12);
    expect(months[0]!.month).toBe('2025-11');
    expect(months.at(-1)).toEqual({ month: '2026-10', totalCents: 170_000 });
    expect(months.find((m) => m.month === '2026-08')!.totalCents).toBe(50_000);
    expect(months.find((m) => m.month === '2026-09')!.totalCents).toBe(0);

    const top = await topClients(owner.org.id, 12, 5, now);
    expect(top).toEqual([
      { id: acme.id, name: 'Acme Robotics Inc.', totalCents: 150_000 },
      { id: fern.id, name: 'Fern', totalCents: 70_000 },
    ]);
  });
});
