import request from 'supertest';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOutbox, getOutbox } from '../src/lib/email.js';
import { prisma } from '../src/lib/prisma.js';
import { stripe } from '../src/lib/stripe.js';
import { app, createClient, createInvoice, ORIGIN, resetDb, signUp } from './helpers.js';

beforeEach(async () => {
  await resetDb();
  clearOutbox();
});
afterEach(() => vi.restoreAllMocks());

/** Agency with one client ("Acme") that has a sent invoice, a draft, and another client's invoice. */
async function agencyWithInvoices() {
  const owner = await signUp();
  const slug = owner.org.slug;
  const acme = await createClient(owner.agent, slug, { email: 'jordan@acme.test' });
  const other = await createClient(owner.agent, slug, { name: 'Other Co', email: 'other@co.test' });

  const sent = await createInvoice(owner.agent, slug, acme.id);
  await owner.agent
    .post(`/api/orgs/${slug}/invoices/${sent.id}/send`)
    .set('Origin', ORIGIN)
    .expect(200);
  const draft = await createInvoice(owner.agent, slug, acme.id);
  const otherInvoice = await createInvoice(owner.agent, slug, other.id);
  await owner.agent
    .post(`/api/orgs/${slug}/invoices/${otherInvoice.id}/send`)
    .set('Origin', ORIGIN)
    .expect(200);
  clearOutbox();
  return { owner, slug, acme, other, sent, draft, otherInvoice };
}

function latestPortalToken() {
  const email = getOutbox()[0];
  const url = email?.text.match(/https?:\/\/\S+\/verify\?token=[^\s)\]]+/)?.[0];
  if (!url) throw new Error('No portal link email');
  const parsed = new URL(url.replace(/&amp;/g, '&'));
  return {
    token: parsed.searchParams.get('token')!,
    next: parsed.searchParams.get('next'),
    email: email!,
  };
}

async function portalLogin(slug: string, email = 'jordan@acme.test') {
  const agent = request.agent(app);
  await agent
    .post(`/api/portal/${slug}/magic-link`)
    .set('Origin', ORIGIN)
    .send({ email })
    .expect(200);
  const { token } = latestPortalToken();
  await agent.post(`/api/portal/${slug}/verify`).set('Origin', ORIGIN).send({ token }).expect(200);
  return agent;
}

describe('portal sign-in', () => {
  it('exposes public branding only', async () => {
    const { slug, owner } = await agencyWithInvoices();
    const res = await request(app).get(`/api/portal/${slug}/info`);
    expect(res.body.organization).toEqual({
      name: owner.org.name,
      slug,
      brandColor: '#4f46e5',
      logoUrl: null,
    });
    expect((await request(app).get('/api/portal/nope/info')).status).toBe(404);
  });

  it("emails a magic link to a client's billing email — and answers identically for strangers", async () => {
    const { slug } = await agencyWithInvoices();
    const known = await request(app)
      .post(`/api/portal/${slug}/magic-link`)
      .set('Origin', ORIGIN)
      .send({ email: 'Jordan@Acme.test' });
    expect(getOutbox()).toHaveLength(1);
    expect(getOutbox()[0]!.to).toBe('jordan@acme.test');

    const unknown = await request(app)
      .post(`/api/portal/${slug}/magic-link`)
      .set('Origin', ORIGIN)
      .send({ email: 'nobody@x.test' });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(getOutbox()).toHaveLength(1); // no email for strangers
  });

  it('archived clients cannot sign in', async () => {
    const { owner, slug, acme } = await agencyWithInvoices();
    await owner.agent
      .patch(`/api/orgs/${slug}/clients/${acme.id}`)
      .set('Origin', ORIGIN)
      .send({ archived: true });
    await request(app)
      .post(`/api/portal/${slug}/magic-link`)
      .set('Origin', ORIGIN)
      .send({ email: 'jordan@acme.test' });
    expect(getOutbox()).toHaveLength(0);
  });

  it('magic links are single-use and expire', async () => {
    const { slug } = await agencyWithInvoices();
    await request(app)
      .post(`/api/portal/${slug}/magic-link`)
      .set('Origin', ORIGIN)
      .send({ email: 'jordan@acme.test' });
    const { token } = latestPortalToken();

    const first = await request(app)
      .post(`/api/portal/${slug}/verify`)
      .set('Origin', ORIGIN)
      .send({ token });
    expect(first.status).toBe(200);
    expect(first.headers['set-cookie']?.[0]).toMatch(/ll_portal=.*Path=\/api\/portal.*HttpOnly/);
    expect(
      (await request(app).post(`/api/portal/${slug}/verify`).set('Origin', ORIGIN).send({ token }))
        .status,
    ).toBe(400);

    await request(app)
      .post(`/api/portal/${slug}/magic-link`)
      .set('Origin', ORIGIN)
      .send({ email: 'jordan@acme.test' });
    const second = latestPortalToken();
    await prisma.portalMagicLink.updateMany({
      where: { usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(
      (
        await request(app)
          .post(`/api/portal/${slug}/verify`)
          .set('Origin', ORIGIN)
          .send({ token: second.token })
      ).status,
    ).toBe(400);
  });

  it("a link for one agency's portal can't be used on another's", async () => {
    const { slug } = await agencyWithInvoices();
    const otherAgency = await signUp();
    await request(app)
      .post(`/api/portal/${slug}/magic-link`)
      .set('Origin', ORIGIN)
      .send({ email: 'jordan@acme.test' });
    const { token } = latestPortalToken();
    const res = await request(app)
      .post(`/api/portal/${otherAgency.org.slug}/verify`)
      .set('Origin', ORIGIN)
      .send({ token });
    expect(res.status).toBe(400);
  });

  it('an agency session cannot access the portal, and a portal session cannot access the agency API', async () => {
    const { owner, slug } = await agencyWithInvoices();
    expect((await owner.agent.get(`/api/portal/${slug}/invoices`)).status).toBe(401);

    const client = await portalLogin(slug);
    expect((await client.get(`/api/orgs/${slug}`)).status).toBe(401);
  });
});

describe('portal data', () => {
  it("lists only this client's non-draft invoices", async () => {
    const { slug, sent } = await agencyWithInvoices();
    const client = await portalLogin(slug);
    const res = await client.get(`/api/portal/${slug}/invoices`);
    expect(res.body.invoices.map((i: { id: string }) => i.id)).toEqual([sent.id]);
    expect(res.body.outstandingCents).toBe(sent.totalCents);
  });

  it("can't open drafts, other clients' invoices or another org's portal", async () => {
    const { slug, draft, otherInvoice, sent } = await agencyWithInvoices();
    const client = await portalLogin(slug);
    expect((await client.get(`/api/portal/${slug}/invoices/${sent.id}`)).status).toBe(200);
    expect((await client.get(`/api/portal/${slug}/invoices/${draft.id}`)).status).toBe(404);
    expect((await client.get(`/api/portal/${slug}/invoices/${otherInvoice.id}`)).status).toBe(404);
    expect((await client.get(`/api/portal/${slug}/invoices/${otherInvoice.id}/pdf`)).status).toBe(
      404,
    );

    const otherAgency = await signUp();
    expect((await client.get(`/api/portal/${otherAgency.org.slug}/invoices`)).status).toBe(401);
  });

  it('access is revoked when the client is archived', async () => {
    const { owner, slug, acme } = await agencyWithInvoices();
    const client = await portalLogin(slug);
    await owner.agent
      .patch(`/api/orgs/${slug}/clients/${acme.id}`)
      .set('Origin', ORIGIN)
      .send({ archived: true });
    expect((await client.get(`/api/portal/${slug}/invoices`)).status).toBe(401);
  });
});

describe('paying invoices', () => {
  function paidSession(
    invoiceId: string,
    organizationId: string,
    overrides: Partial<Stripe.Checkout.Session> = {},
  ) {
    return {
      id: 'cs_test_paid',
      object: 'checkout.session',
      mode: 'payment',
      payment_status: 'paid',
      payment_intent: 'pi_123',
      amount_total: 398_750,
      currency: 'usd',
      metadata: { kind: 'invoice', invoiceId, organizationId },
      ...overrides,
    } as unknown as Stripe.Checkout.Session;
  }

  it('creates a Checkout session for the exact invoice total', async () => {
    const { slug, sent, owner } = await agencyWithInvoices();
    const client = await portalLogin(slug);
    const create = vi
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({
        id: 'cs_test_1',
        url: 'https://checkout.stripe.com/c/pay/cs_test_1',
      } as never);

    const res = await client
      .post(`/api/portal/${slug}/invoices/${sent.id}/pay`)
      .set('Origin', ORIGIN);
    expect(res.body.url).toContain('checkout.stripe.com');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        customer_email: 'jordan@acme.test',
        metadata: { kind: 'invoice', invoiceId: sent.id, organizationId: owner.org.id },
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: sent.totalCents, currency: 'usd' }),
          }),
        ],
      }),
    );
  });

  it('records the payment once whether the webhook or the return confirmation arrives first', async () => {
    const { slug, sent, owner } = await agencyWithInvoices();
    const client = await portalLogin(slug);
    const session = paidSession(sent.id, owner.org.id);
    vi.spyOn(stripe.checkout.sessions, 'retrieve').mockResolvedValue(session as never);

    const confirm = await client
      .post(`/api/portal/${slug}/invoices/${sent.id}/confirm`)
      .set('Origin', ORIGIN)
      .send({ sessionId: 'cs_test_paid' });
    expect(confirm.body).toMatchObject({ paid: true, invoice: { status: 'PAID' } });

    // Webhook arrives afterwards
    const payload = JSON.stringify({
      id: 'evt_pay_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: session },
    });
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
    await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', sig)
      .send(payload)
      .expect(200);

    const payments = await prisma.payment.findMany({ where: { invoiceId: sent.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      method: 'STRIPE',
      amountCents: 398_750,
      stripePaymentIntentId: 'pi_123',
    });

    // The agency sees it on the dashboard
    const dash = await owner.agent.get(`/api/orgs/${slug}/dashboard`);
    expect(dash.body.stats.collectedThisMonthCents).toBe(398_750);

    expect(
      (await client.post(`/api/portal/${slug}/invoices/${sent.id}/pay`).set('Origin', ORIGIN))
        .status,
    ).toBe(409);
  });

  it("rejects a confirmation using another invoice's checkout session", async () => {
    const { slug, sent, otherInvoice, owner } = await agencyWithInvoices();
    const client = await portalLogin(slug);
    vi.spyOn(stripe.checkout.sessions, 'retrieve').mockResolvedValue(
      paidSession(otherInvoice.id, owner.org.id) as never,
    );
    const res = await client
      .post(`/api/portal/${slug}/invoices/${sent.id}/confirm`)
      .set('Origin', ORIGIN)
      .send({ sessionId: 'cs_test_other' });
    expect(res.status).toBe(400);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('ignores unpaid sessions', async () => {
    const { slug, sent, owner } = await agencyWithInvoices();
    const client = await portalLogin(slug);
    vi.spyOn(stripe.checkout.sessions, 'retrieve').mockResolvedValue(
      paidSession(sent.id, owner.org.id, { payment_status: 'unpaid' }) as never,
    );
    const res = await client
      .post(`/api/portal/${slug}/invoices/${sent.id}/confirm`)
      .set('Origin', ORIGIN)
      .send({ sessionId: 'cs_x' });
    expect(res.body.paid).toBe(false);
  });
});

describe('agency → client links', () => {
  it('invoice emails include a "View & pay" link that signs the client into that invoice', async () => {
    const owner = await signUp();
    const client = await createClient(owner.agent, owner.org.slug, { email: 'jordan@acme.test' });
    const inv = await createInvoice(owner.agent, owner.org.slug, client.id);
    await owner.agent
      .post(`/api/orgs/${owner.org.slug}/invoices/${inv.id}/send`)
      .set('Origin', ORIGIN)
      .expect(200);

    expect(getOutbox()[0]!.html).toContain('View &amp; pay invoice');
    const { token, next } = latestPortalToken();
    expect(next).toBe(`/portal/${owner.org.slug}/invoices/${inv.id}`);

    const agent = request.agent(app);
    await agent
      .post(`/api/portal/${owner.org.slug}/verify`)
      .set('Origin', ORIGIN)
      .send({ token })
      .expect(200);
    expect((await agent.get(`/api/portal/${owner.org.slug}/invoices/${inv.id}`)).status).toBe(200);
  });

  it('agency members can email a portal invite; the link lasts 7 days', async () => {
    const owner = await signUp();
    const client = await createClient(owner.agent, owner.org.slug, { email: 'jordan@acme.test' });
    const res = await owner.agent
      .post(`/api/orgs/${owner.org.slug}/clients/${client.id}/portal-invite`)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(200);

    const { email } = latestPortalToken();
    expect(email.subject).toBe(`${owner.org.name} invited you to their client portal`);
    const link = await prisma.portalMagicLink.findFirstOrThrow();
    expect(link.expiresAt.getTime() - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });
});
