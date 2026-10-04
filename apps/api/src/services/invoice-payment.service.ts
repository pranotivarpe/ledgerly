import type Stripe from 'stripe';
import { Prisma } from '../generated/prisma/client.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { notifyInvoicePaidOnline } from './notification.service.js';

/**
 * Records a successful Stripe Checkout payment for an invoice. Called from both the webhook and the
 * "return from Checkout" confirmation — the unique payment-intent ID makes it exactly-once.
 */
export async function recordInvoiceCheckout(session: Stripe.Checkout.Session) {
  if (session.mode !== 'payment' || session.metadata?.kind !== 'invoice') return null;
  if (session.payment_status !== 'paid') return null;

  const invoiceId = session.metadata.invoiceId;
  const organizationId = session.metadata.organizationId;
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!invoiceId || !organizationId || !paymentIntentId) return null;

  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId } });
  if (!invoice) {
    logger.warn({ invoiceId }, 'checkout completed for unknown invoice');
    return null;
  }

  const paidAt = new Date();
  try {
    await prisma.$transaction([
      prisma.payment.create({
        data: {
          organizationId,
          invoiceId,
          amountCents: session.amount_total ?? invoice.totalCents,
          currency: (session.currency ?? invoice.currency).toUpperCase(),
          method: 'STRIPE',
          stripePaymentIntentId: paymentIntentId,
          paidAt,
        },
      }),
      prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'PAID', paidAt } }),
      prisma.activityLog.create({
        data: {
          organizationId,
          action: 'invoice.paid',
          entityType: 'invoice',
          entityId: invoiceId,
          metadata: {
            number: invoice.number,
            method: 'STRIPE',
            amountCents: session.amount_total ?? invoice.totalCents,
          },
        },
      }),
    ]);
  } catch (err) {
    // Already recorded by the other path (webhook vs. return confirmation).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return invoice;
    throw err;
  }

  // Only the path that actually recorded the payment sends the emails — so they go out once.
  await notifyInvoicePaidOnline(invoice.id);
  return invoice;
}
