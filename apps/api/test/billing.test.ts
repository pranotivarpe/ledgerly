import request from 'supertest';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { stripe } from '../src/lib/stripe.js';
import { app, ORIGIN, resetDb, setPlan, signUp } from './helpers.js';

const WEBHOOK_SECRET = 'whsec_test_secret';
const PERIOD_END = Math.floor(new Date('2026-11-04T00:00:00Z').getTime() / 1000);

type SubOverrides = Partial<{
  id: string;
  customer: string;
  status: Stripe.Subscription.Status;
  lookupKey: string;
  cancelAtPeriodEnd: boolean;
  orgId: string;
}>;

function fakeSubscription(o: SubOverrides = {}): Stripe.Subscription {
  return {
    id: o.id ?? 'sub_123',
    object: 'subscription',
    customer: o.customer ?? 'cus_123',
    status: o.status ?? 'active',
    cancel_at_period_end: o.cancelAtPeriodEnd ?? false,
    cancel_at: null,
    created: 1_700_000_000,
    metadata: o.orgId ? { organizationId: o.orgId } : {},
    items: {
      object: 'list',
      data: [
        {
          id: 'si_123',
          current_period_end: PERIOD_END,
          price: { id: 'price_x', lookup_key: o.lookupKey ?? 'ledgerly_pro_monthly' },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

let eventCounter = 0;
function sendWebhook(type: string, object: unknown, id = `evt_${++eventCounter}`) {
  const payload = JSON.stringify({ id, object: 'event', type, data: { object } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return request(app)
    .post('/api/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
}

let retrieve: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await resetDb();
  retrieve = vi.spyOn(stripe.subscriptions, 'retrieve');
});

afterEach(() => vi.restoreAllMocks());

async function orgWithCustomer() {
  const owner = await signUp();
  await prisma.organization.update({
    where: { id: owner.org.id },
    data: { stripeCustomerId: 'cus_123' },
  });
  return owner;
}

const getOrg = (id: string) => prisma.organization.findUniqueOrThrow({ where: { id } });

describe('Stripe webhooks', () => {
  it('rejects requests with an invalid signature', async () => {
    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=forged')
      .send(
        JSON.stringify({
          id: 'evt_x',
          type: 'customer.subscription.updated',
          data: { object: {} },
        }),
      );
    expect(res.status).toBe(400);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('checkout.session.completed links the customer and activates the plan', async () => {
    const owner = await signUp();
    retrieve.mockResolvedValue(
      fakeSubscription({ customer: 'cus_new', orgId: owner.org.id }) as never,
    );

    const res = await sendWebhook('checkout.session.completed', {
      id: 'cs_1',
      object: 'checkout.session',
      mode: 'subscription',
      client_reference_id: owner.org.id,
      customer: 'cus_new',
      subscription: 'sub_123',
      metadata: {},
    });
    expect(res.status).toBe(200);

    const org = await getOrg(owner.org.id);
    expect(org).toMatchObject({
      plan: 'PRO',
      stripeCustomerId: 'cus_new',
      stripeSubscriptionId: 'sub_123',
      subscriptionStatus: 'ACTIVE',
      cancelAtPeriodEnd: false,
    });
    expect(org.currentPeriodEnd?.toISOString()).toBe('2026-11-04T00:00:00.000Z');
  });

  it('uses the latest subscription from Stripe, not the (possibly stale) event payload', async () => {
    const owner = await orgWithCustomer();
    retrieve.mockResolvedValue(fakeSubscription({ lookupKey: 'ledgerly_team_monthly' }) as never);

    // Stale payload says PRO; Stripe says TEAM.
    await sendWebhook('customer.subscription.updated', fakeSubscription()).expect(200);
    expect((await getOrg(owner.org.id)).plan).toBe('TEAM');
    expect(retrieve).toHaveBeenCalledWith('sub_123');
  });

  it('processes each event only once', async () => {
    const owner = await orgWithCustomer();
    retrieve.mockResolvedValue(fakeSubscription() as never);

    await sendWebhook('customer.subscription.created', fakeSubscription(), 'evt_dup').expect(200);
    const second = await sendWebhook(
      'customer.subscription.created',
      fakeSubscription(),
      'evt_dup',
    );
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(await prisma.stripeEvent.count()).toBe(1);
    expect((await getOrg(owner.org.id)).plan).toBe('PRO');
  });

  it('tracks cancel-at-period-end without removing access early', async () => {
    const owner = await orgWithCustomer();
    retrieve.mockResolvedValue(fakeSubscription({ cancelAtPeriodEnd: true }) as never);
    await sendWebhook('customer.subscription.updated', fakeSubscription()).expect(200);
    expect(await getOrg(owner.org.id)).toMatchObject({ plan: 'PRO', cancelAtPeriodEnd: true });
  });

  it('keeps paid features during past_due (grace period)', async () => {
    const owner = await orgWithCustomer();
    retrieve.mockResolvedValue(fakeSubscription({ status: 'past_due' }) as never);
    await sendWebhook('customer.subscription.updated', fakeSubscription()).expect(200);
    expect(await getOrg(owner.org.id)).toMatchObject({
      plan: 'PRO',
      subscriptionStatus: 'PAST_DUE',
    });
  });

  it('subscription deleted → back to Free', async () => {
    const owner = await orgWithCustomer();
    await prisma.organization.update({
      where: { id: owner.org.id },
      data: { plan: 'TEAM', stripeSubscriptionId: 'sub_123', subscriptionStatus: 'ACTIVE' },
    });
    retrieve.mockResolvedValue(fakeSubscription({ status: 'canceled' }) as never);

    await sendWebhook('customer.subscription.deleted', fakeSubscription()).expect(200);
    const org = await getOrg(owner.org.id);
    expect(org).toMatchObject({
      plan: 'FREE',
      stripeSubscriptionId: null,
      subscriptionStatus: 'CANCELED',
    });

    const activity = await prisma.activityLog.findFirst({
      where: { action: 'billing.plan_changed' },
    });
    expect(activity?.metadata).toEqual({ from: 'TEAM', to: 'FREE' });
  });

  it('ignores a stale cancellation of an old subscription', async () => {
    const owner = await orgWithCustomer();
    await prisma.organization.update({
      where: { id: owner.org.id },
      data: { plan: 'PRO', stripeSubscriptionId: 'sub_current', subscriptionStatus: 'ACTIVE' },
    });
    retrieve.mockResolvedValue(fakeSubscription({ id: 'sub_old', status: 'canceled' }) as never);
    await sendWebhook('customer.subscription.deleted', fakeSubscription({ id: 'sub_old' })).expect(
      200,
    );
    expect((await getOrg(owner.org.id)).plan).toBe('PRO');
  });

  it('acknowledges events for unknown customers without failing', async () => {
    retrieve.mockResolvedValue(fakeSubscription({ customer: 'cus_unknown' }) as never);
    await sendWebhook('customer.subscription.updated', fakeSubscription()).expect(200);
  });

  it('returns 500 when processing fails so Stripe retries — and does not mark it processed', async () => {
    await orgWithCustomer();
    retrieve.mockRejectedValue(new Error('Stripe is down') as never);
    const res = await sendWebhook('customer.subscription.updated', fakeSubscription(), 'evt_retry');
    expect(res.status).toBe(500);
    expect(await prisma.stripeEvent.count()).toBe(0);

    retrieve.mockResolvedValue(fakeSubscription() as never);
    await sendWebhook('customer.subscription.updated', fakeSubscription(), 'evt_retry').expect(200);
  });
});

describe('billing endpoints', () => {
  function mockPrices() {
    vi.spyOn(stripe.prices, 'list').mockResolvedValue({
      data: [
        { id: 'price_pro', lookup_key: 'ledgerly_pro_monthly', unit_amount: 1900, currency: 'usd' },
        {
          id: 'price_team',
          lookup_key: 'ledgerly_team_monthly',
          unit_amount: 4900,
          currency: 'usd',
        },
      ],
    } as never);
  }

  it('owner starts Checkout: creates a customer once and returns the Stripe URL', async () => {
    const owner = await signUp();
    mockPrices();
    const createCustomer = vi
      .spyOn(stripe.customers, 'create')
      .mockResolvedValue({ id: 'cus_abc' } as never);
    const createSession = vi
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test' } as never);

    const res = await owner.agent
      .post(`/api/orgs/${owner.org.slug}/billing/checkout`)
      .set('Origin', ORIGIN)
      .send({ plan: 'TEAM' });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.com/c/pay/cs_test');
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_abc',
        client_reference_id: owner.org.id,
        line_items: [{ price: 'price_team', quantity: 1 }],
      }),
    );

    await owner.agent
      .post(`/api/orgs/${owner.org.slug}/billing/checkout`)
      .set('Origin', ORIGIN)
      .send({ plan: 'PRO' });
    expect(createCustomer).toHaveBeenCalledTimes(1); // customer reused
  });

  it('only owners can manage billing', async () => {
    const owner = await signUp();
    const admin = await signUp();
    await prisma.membership.create({
      data: { userId: admin.user.id, organizationId: owner.org.id, role: 'ADMIN' },
    });

    const res = await admin.agent
      .post(`/api/orgs/${owner.org.slug}/billing/checkout`)
      .set('Origin', ORIGIN)
      .send({ plan: 'PRO' });
    expect(res.status).toBe(403);
    expect((await admin.agent.get(`/api/orgs/${owner.org.slug}/billing`)).status).toBe(200); // can view
  });

  it("can't start a second checkout with an active subscription", async () => {
    const owner = await orgWithCustomer();
    await prisma.organization.update({
      where: { id: owner.org.id },
      data: { plan: 'PRO', stripeSubscriptionId: 'sub_123' },
    });
    const res = await owner.agent
      .post(`/api/orgs/${owner.org.slug}/billing/checkout`)
      .set('Origin', ORIGIN)
      .send({ plan: 'TEAM' });
    expect(res.status).toBe(409);
  });

  it('blocks a downgrade that would exceed the new seat limit', async () => {
    const owner = await orgWithCustomer();
    await prisma.organization.update({
      where: { id: owner.org.id },
      data: { plan: 'TEAM', stripeSubscriptionId: 'sub_123' },
    });
    for (let i = 0; i < 3; i++) {
      const u = await signUp();
      await prisma.membership.create({
        data: { userId: u.user.id, organizationId: owner.org.id, role: 'MEMBER' },
      });
    }
    const res = await owner.agent
      .post(`/api/orgs/${owner.org.slug}/billing/change-plan`)
      .set('Origin', ORIGIN)
      .send({ plan: 'PRO' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/using 4/);
  });

  it('switches plans with proration and syncs immediately', async () => {
    const owner = await orgWithCustomer();
    await setPlan(owner.org.id, 'PRO');
    await prisma.organization.update({
      where: { id: owner.org.id },
      data: { stripeSubscriptionId: 'sub_123' },
    });
    mockPrices();
    retrieve.mockResolvedValue(fakeSubscription() as never);
    const update = vi
      .spyOn(stripe.subscriptions, 'update')
      .mockResolvedValue(fakeSubscription({ lookupKey: 'ledgerly_team_monthly' }) as never);

    const res = await owner.agent
      .post(`/api/orgs/${owner.org.slug}/billing/change-plan`)
      .set('Origin', ORIGIN)
      .send({ plan: 'TEAM' });
    expect(res.status).toBe(200);
    expect(res.body.billing).toMatchObject({
      plan: 'TEAM',
      usage: { seats: { used: 1, limit: 10 } },
    });
    expect(update).toHaveBeenCalledWith(
      'sub_123',
      expect.objectContaining({
        items: [{ id: 'si_123', price: 'price_team' }],
        proration_behavior: 'create_prorations',
      }),
    );
  });

  it('portal requires a billing account', async () => {
    const owner = await signUp();
    const res = await owner.agent
      .post(`/api/orgs/${owner.org.slug}/billing/portal`)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(400);
  });

  it('sync pulls the current subscription from Stripe', async () => {
    const owner = await orgWithCustomer();
    vi.spyOn(stripe.subscriptions, 'list').mockResolvedValue({
      data: [fakeSubscription()],
    } as never);
    const res = await owner.agent
      .post(`/api/orgs/${owner.org.slug}/billing/sync`)
      .set('Origin', ORIGIN);
    expect(res.body.billing).toMatchObject({
      plan: 'PRO',
      status: 'ACTIVE',
      hasBillingAccount: true,
    });
  });
});
