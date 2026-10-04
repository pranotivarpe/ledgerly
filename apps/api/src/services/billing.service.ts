import type Stripe from 'stripe';
import type { Organization, Plan, SubscriptionStatus } from '../generated/prisma/client.js';
import { logger } from '../lib/logger.js';
import { PLAN_LIMITS } from '../lib/plans.js';
import { prisma } from '../lib/prisma.js';
import { planFromLookupKey, stripe } from '../lib/stripe.js';
import { forTenant } from '../lib/tenant.js';
import { seatUsage } from './invitation.service.js';
import { usage } from './plan-limits.service.js';

const STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  past_due: 'PAST_DUE',
  unpaid: 'PAST_DUE',
  canceled: 'CANCELED',
  incomplete_expired: 'CANCELED',
  incomplete: 'INCOMPLETE',
  paused: 'INCOMPLETE',
};

/** Statuses that keep paid features on. past_due is a grace period while Stripe retries the card. */
const ENTITLED: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due'];

const customerId = (c: string | Stripe.Customer | Stripe.DeletedCustomer) =>
  typeof c === 'string' ? c : c.id;

async function findOrgForSubscription(sub: Stripe.Subscription) {
  const byCustomer = await prisma.organization.findUnique({
    where: { stripeCustomerId: customerId(sub.customer) },
  });
  if (byCustomer) return byCustomer;
  const orgId = sub.metadata?.organizationId;
  return orgId ? prisma.organization.findUnique({ where: { id: orgId } }) : null;
}

/**
 * Applies a Stripe subscription to its organization. State-based, so it's safe to run any number
 * of times and in any order — callers always pass the *latest* subscription fetched from Stripe.
 */
export async function syncSubscription(sub: Stripe.Subscription) {
  const org = await findOrgForSubscription(sub);
  if (!org) {
    logger.warn({ subscriptionId: sub.id }, 'stripe subscription for unknown organization');
    return null;
  }

  // A canceled/expired subscription only matters if it's the one we're tracking (or none is).
  const entitled = ENTITLED.includes(sub.status);
  if (!entitled && org.stripeSubscriptionId && org.stripeSubscriptionId !== sub.id) return org;

  const item = sub.items.data[0];
  const paidPlan = planFromLookupKey(item?.price.lookup_key);
  const plan: Plan = entitled && paidPlan ? paidPlan : 'FREE';
  const periodEnd = Math.max(0, ...sub.items.data.map((i) => i.current_period_end ?? 0));

  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: {
      plan,
      stripeCustomerId: customerId(sub.customer),
      stripeSubscriptionId: entitled ? sub.id : null,
      subscriptionStatus: STATUS_MAP[sub.status],
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: entitled && (sub.cancel_at_period_end || Boolean(sub.cancel_at)),
    },
  });

  if (org.plan !== plan) {
    await prisma.activityLog.create({
      data: {
        organizationId: org.id,
        action: 'billing.plan_changed',
        metadata: { from: org.plan, to: plan },
      },
    });
  }
  return updated;
}

export async function retrieveSubscription(id: string) {
  return stripe.subscriptions.retrieve(id);
}

/** Re-reads the customer's subscriptions from Stripe (used right after Checkout returns). */
export async function syncFromStripe(org: Organization) {
  if (!org.stripeCustomerId) return org;
  const { data } = await stripe.subscriptions.list({
    customer: org.stripeCustomerId,
    status: 'all',
    limit: 10,
  });
  const current =
    data.find((s) => ENTITLED.includes(s.status)) ?? data.sort((a, b) => b.created - a.created)[0];
  if (!current) return org;
  return (await syncSubscription(current)) ?? org;
}

export async function ensureCustomer(org: Organization, email: string) {
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customer = await stripe.customers.create({
    name: org.name,
    email,
    metadata: { organizationId: org.id },
  });
  // Conditional write: if two requests race, the first customer wins and is reused.
  const { count } = await prisma.organization.updateMany({
    where: { id: org.id, stripeCustomerId: null },
    data: { stripeCustomerId: customer.id },
  });
  if (count === 0) {
    const fresh = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    return fresh.stripeCustomerId!;
  }
  return customer.id;
}

export async function billingSummary(org: Organization) {
  const db = forTenant(org.id);
  const [seats, planUsage] = await Promise.all([seatUsage(db, org), usage(db, org)]);
  const limits = PLAN_LIMITS[org.plan];
  return {
    plan: org.plan,
    status: org.subscriptionStatus,
    currentPeriodEnd: org.currentPeriodEnd,
    cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    hasBillingAccount: Boolean(org.stripeCustomerId),
    usage: {
      seats: { used: seats.used, limit: limits.seats },
      clients: { used: planUsage.activeClients, limit: limits.clients },
      invoicesThisMonth: { used: planUsage.invoicesThisMonth, limit: limits.invoicesPerMonth },
    },
  };
}
