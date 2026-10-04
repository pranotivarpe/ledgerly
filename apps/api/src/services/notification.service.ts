import { createElement } from 'react';
import { env } from '../env.js';
import { BillingFailedEmail } from '../emails/billing-failed-email.js';
import { PaymentNotificationEmail } from '../emails/payment-notification-email.js';
import { PaymentReceiptEmail } from '../emails/payment-receipt-email.js';
import { WelcomeEmail } from '../emails/welcome-email.js';
import type { Organization, Role } from '../generated/prisma/client.js';
import { sendEmailSafely } from '../lib/email.js';
import { formatMoney } from '../lib/money.js';
import { prisma } from '../lib/prisma.js';

const longDate = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);

async function teamEmails(organizationId: string, roles: Role[]) {
  const members = await prisma.membership.findMany({
    where: { organizationId, role: { in: roles } },
    select: { user: { select: { email: true } } },
  });
  return members.map((m) => m.user.email);
}

/** Receipt to the client + "you got paid" to the agency's owners and admins. */
export async function notifyInvoicePaidOnline(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, organization: true },
  });
  if (!invoice) return;
  const { organization: org, client } = invoice;
  const amount = formatMoney(invoice.totalCents, invoice.currency);

  await sendEmailSafely({
    to: client.email,
    subject: `Receipt: ${amount} paid to ${org.name} (${invoice.number})`,
    template: createElement(PaymentReceiptEmail, {
      organizationName: org.name,
      clientName: client.name,
      invoiceNumber: invoice.number,
      amount,
      paidOn: longDate(invoice.paidAt ?? new Date()),
      invoiceUrl: `${env.WEB_URL}/portal/${org.slug}/invoices/${invoice.id}`,
    }),
  });

  const recipients = await teamEmails(org.id, ['OWNER', 'ADMIN']);
  await Promise.all(
    recipients.map((to) =>
      sendEmailSafely({
        to,
        subject: `💸 ${client.company || client.name} paid ${amount} (${invoice.number})`,
        template: createElement(PaymentNotificationEmail, {
          clientName: client.company || client.name,
          invoiceNumber: invoice.number,
          amount,
          invoiceUrl: `${env.WEB_URL}/app/${org.slug}/invoices/${invoice.id}`,
        }),
      }),
    ),
  );
}

export async function notifyBillingFailed(
  org: Organization,
  amountCents: number,
  currency: string,
) {
  const owners = await teamEmails(org.id, ['OWNER']);
  const amount = formatMoney(amountCents, currency.toUpperCase());
  await Promise.all(
    owners.map((to) =>
      sendEmailSafely({
        to,
        subject: `Action needed: your Ledgerly payment of ${amount} failed`,
        template: createElement(BillingFailedEmail, {
          organizationName: org.name,
          amount,
          billingUrl: `${env.WEB_URL}/app/${org.slug}/billing`,
        }),
      }),
    ),
  );
}

export async function sendWelcome(
  user: { name: string; email: string },
  org: { name: string; slug: string },
) {
  await sendEmailSafely({
    to: user.email,
    subject: `Welcome to Ledgerly — ${org.name} is ready`,
    template: createElement(WelcomeEmail, {
      name: user.name,
      organizationName: org.name,
      appUrl: `${env.WEB_URL}/app/${org.slug}`,
    }),
  });
}
