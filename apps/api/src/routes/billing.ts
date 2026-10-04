import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { logActivity } from '../lib/activity.js';
import { HttpError } from '../lib/http-error.js';
import { PLAN_LIMITS, PLAN_NAMES } from '../lib/plans.js';
import { prisma } from '../lib/prisma.js';
import { getPlanPrices, getPortalConfigurationId, stripe } from '../lib/stripe.js';
import { getAuth, getTenant, requirePermission } from '../middleware/tenant.js';
import { parseBody } from '../middleware/validate.js';
import { seatUsage } from '../services/invitation.service.js';
import {
  billingSummary,
  ensureCustomer,
  retrieveSubscription,
  syncFromStripe,
  syncSubscription,
} from '../services/billing.service.js';

export const billingRouter = Router({ mergeParams: true });

const planSchema = z.object({ plan: z.enum(['PRO', 'TEAM']) });

const billingUrl = (slug: string, query = '') => `${env.WEB_URL}/app/${slug}/billing${query}`;

billingRouter.get('/', async (req, res) => {
  const { organization } = getTenant(req);
  let prices: Record<string, { amount: number; currency: string }> | null = null;
  try {
    const p = await getPlanPrices();
    prices = Object.fromEntries(
      Object.entries(p).map(([plan, price]) => [
        plan,
        { amount: price.unit_amount ?? 0, currency: price.currency },
      ]),
    );
  } catch {
    prices = null; // page still renders with the static pricing table
  }
  res.json({ billing: await billingSummary(organization), prices });
});

/** Starts Stripe Checkout for an organization without an active subscription. */
billingRouter.post('/checkout', requirePermission('billing:manage'), async (req, res) => {
  const { organization } = getTenant(req);
  const { plan } = parseBody(planSchema, req);
  if (organization.stripeSubscriptionId && organization.plan !== 'FREE') {
    throw HttpError.conflict('You already have a subscription. Change plans instead.');
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: getAuth(req).userId } });
  const [customer, prices] = await Promise.all([
    ensureCustomer(organization, user.email),
    getPlanPrices(),
  ]);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: organization.id,
    line_items: [{ price: prices[plan].id, quantity: 1 }],
    subscription_data: { metadata: { organizationId: organization.id } },
    metadata: { organizationId: organization.id },
    allow_promotion_codes: true,
    success_url: billingUrl(organization.slug, '?checkout=success'),
    cancel_url: billingUrl(organization.slug, '?checkout=canceled'),
  });

  res.json({ url: session.url });
});

/** Switch between paid plans with proration. Blocks downgrades that would exceed the new seat limit. */
billingRouter.post('/change-plan', requirePermission('billing:manage'), async (req, res) => {
  const { organization, db } = getTenant(req);
  const { plan } = parseBody(planSchema, req);
  if (!organization.stripeSubscriptionId || organization.plan === 'FREE') {
    throw HttpError.badRequest('No active subscription — start a checkout instead.');
  }
  if (organization.plan === plan)
    throw HttpError.badRequest(`You're already on ${PLAN_NAMES[plan]}.`);

  const seats = await seatUsage(db, organization);
  if (seats.used > PLAN_LIMITS[plan].seats) {
    throw HttpError.conflict(
      `${PLAN_NAMES[plan]} includes ${PLAN_LIMITS[plan].seats} seats but you're using ${seats.used}. Remove members or pending invitations first.`,
    );
  }

  const [sub, prices] = await Promise.all([
    retrieveSubscription(organization.stripeSubscriptionId),
    getPlanPrices(),
  ]);
  const item = sub.items.data[0];
  if (!item) throw new HttpError(500, 'Subscription has no items');

  const updated = await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: prices[plan].id }],
    proration_behavior: 'create_prorations',
    cancel_at_period_end: false,
  });
  const org = await syncSubscription(updated);
  await logActivity(req, 'billing.plan_change_requested', undefined, {
    from: organization.plan,
    to: plan,
  });
  res.json({ billing: await billingSummary(org ?? organization) });
});

/** Stripe-hosted Customer Portal: update card, invoices, switch plan, cancel. */
billingRouter.post('/portal', requirePermission('billing:manage'), async (req, res) => {
  const { organization } = getTenant(req);
  if (!organization.stripeCustomerId)
    throw HttpError.badRequest('No billing account yet — choose a plan first.');

  const session = await stripe.billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    configuration: await getPortalConfigurationId(),
    return_url: billingUrl(organization.slug),
  });
  res.json({ url: session.url });
});

/** Pulls the latest subscription state from Stripe — called when returning from Checkout/Portal. */
billingRouter.post('/sync', async (req, res) => {
  const { organization } = getTenant(req);
  const org = await syncFromStripe(organization);
  res.json({ billing: await billingSummary(org) });
});
