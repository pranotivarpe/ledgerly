import express, { Router } from 'express';
import type Stripe from 'stripe';
import { env } from '../env.js';
import { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { retrieveSubscription, syncSubscription } from '../services/billing.service.js';

export const webhooksRouter = Router();

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

async function handleEvent(event: Stripe.Event) {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.mode !== 'subscription' || !session.subscription) return;
    const orgId = session.client_reference_id ?? session.metadata?.organizationId;
    if (orgId && session.customer) {
      const customer =
        typeof session.customer === 'string' ? session.customer : session.customer.id;
      await prisma.organization.updateMany({
        where: { id: orgId, stripeCustomerId: null },
        data: { stripeCustomerId: customer },
      });
    }
    const subId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
    await syncSubscription(await retrieveSubscription(subId));
    return;
  }

  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    // Never trust the payload's snapshot: events can arrive out of order, so fetch the latest state.
    const sub = event.data.object as Stripe.Subscription;
    await syncSubscription(await retrieveSubscription(sub.id));
    return;
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const customer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    const org = customer
      ? await prisma.organization.findUnique({ where: { stripeCustomerId: customer } })
      : null;
    if (org) {
      await prisma.activityLog.create({
        data: {
          organizationId: org.id,
          action: 'billing.payment_failed',
          metadata: { amountCents: invoice.amount_due, attempt: invoice.attempt_count },
        },
      });
    }
  }
}

/**
 * Stripe webhook endpoint. Needs the raw body for signature verification, so it's mounted
 * before express.json(). Each event is processed once (StripeEvent table), and handlers are
 * state-based so a retry after a partial failure is always safe.
 */
webhooksRouter.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(500, 'Webhook secret not configured');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.get('stripe-signature') ?? '',
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw HttpError.badRequest('Invalid webhook signature');
  }

  if (await prisma.stripeEvent.findUnique({ where: { id: event.id } })) {
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    await handleEvent(event);
  } catch (err) {
    logger.error({ err, eventId: event.id, type: event.type }, 'stripe webhook handler failed');
    throw err; // 500 → Stripe retries with backoff
  }

  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    // A concurrent delivery of the same event already recorded it — fine.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
  }
  res.json({ received: true });
});
