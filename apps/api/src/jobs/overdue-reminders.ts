import { createElement } from 'react';
import { InvoiceEmail } from '../emails/invoice-email.js';
import { sendEmailSafely } from '../lib/email.js';
import { logger } from '../lib/logger.js';
import { formatMoney } from '../lib/money.js';
import { prisma } from '../lib/prisma.js';
import { renderInvoicePdf } from '../pdf/invoice-pdf.js';
import { invoiceInclude, toPdfData } from '../services/invoice.service.js';
import { invoicePayLink } from '../services/portal.service.js';

export const REMINDER_INTERVAL_DAYS = 3;
/** Stop nudging after this long — at that point it's a conversation, not an email. */
export const REMINDER_WINDOW_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Emails polite reminders for overdue invoices (a Pro/Team feature).
 *
 * Safe to run on several servers at once: each invoice is *claimed* with a conditional update on
 * `lastReminderAt` before its email is sent, so a reminder can never go out twice.
 */
export async function runOverdueReminders(now = new Date()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const cutoff = new Date(now.getTime() - REMINDER_INTERVAL_DAYS * DAY);

  // 1. Flip any sent invoices past their due date to OVERDUE (across all organizations).
  const { count: markedOverdue } = await prisma.invoice.updateMany({
    where: { status: 'SENT', dueDate: { lt: startOfToday } },
    data: { status: 'OVERDUE' },
  });

  // 2. Due for a reminder: overdue, on a paid plan, not reminded (or sent) in the last few days.
  const eligible = {
    status: 'OVERDUE' as const,
    dueDate: { gte: new Date(now.getTime() - REMINDER_WINDOW_DAYS * DAY) },
    organization: { plan: { in: ['PRO' as const, 'TEAM' as const] } },
    AND: [
      { OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cutoff } }] },
      { OR: [{ sentAt: null }, { sentAt: { lt: cutoff } }] },
    ],
  };
  const candidates = await prisma.invoice.findMany({
    where: eligible,
    include: { ...invoiceInclude, organization: true },
    orderBy: { dueDate: 'asc' },
    take: 200,
  });

  let sent = 0;
  for (const invoice of candidates) {
    const { count } = await prisma.invoice.updateMany({
      where: { id: invoice.id, ...eligible },
      data: { lastReminderAt: now },
    });
    if (count === 0) continue; // claimed by another worker, or no longer eligible

    const org = invoice.organization;
    const [pdf, payUrl] = await Promise.all([
      renderInvoicePdf(toPdfData(invoice, org)),
      invoicePayLink(org, invoice),
    ]);
    const ok = await sendEmailSafely({
      deliver: !org.isDemo,
      to: invoice.client.email,
      subject: `Reminder: invoice ${invoice.number} from ${org.name} is overdue`,
      template: createElement(InvoiceEmail, {
        organizationName: org.name,
        clientName: invoice.client.name,
        invoiceNumber: invoice.number,
        amount: formatMoney(invoice.totalCents, invoice.currency),
        dueDate: new Intl.DateTimeFormat('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }).format(invoice.dueDate),
        reminder: true,
        payUrl,
      }),
      attachments: [{ filename: `${invoice.number}.pdf`, content: pdf }],
    });
    if (!ok) {
      // Release the claim so the next run retries.
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { lastReminderAt: invoice.lastReminderAt },
      });
      continue;
    }

    await prisma.activityLog.create({
      data: {
        organizationId: org.id,
        action: 'invoice.reminder_sent',
        entityType: 'invoice',
        entityId: invoice.id,
        metadata: { number: invoice.number, to: invoice.client.email, automatic: true },
      },
    });
    sent += 1;
  }

  logger.info({ markedOverdue, candidates: candidates.length, sent }, 'overdue reminders run');
  return { markedOverdue, candidates: candidates.length, sent };
}
