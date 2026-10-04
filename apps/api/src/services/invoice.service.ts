import type { Prisma } from '../generated/prisma/client.js';
import { computeTotals, lineAmountCents } from '../lib/money.js';
import type { TenantDb } from '../lib/tenant.js';
import type { InvoicePdfData } from '../pdf/invoice-pdf.js';

export const invoiceInclude = {
  client: { select: { id: true, name: true, email: true, company: true, address: true } },
  project: { select: { id: true, name: true } },
  items: { orderBy: { position: 'asc' } },
  payments: { orderBy: { paidAt: 'desc' } },
} as const satisfies Prisma.InvoiceInclude;

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

/**
 * Sent invoices past their due date become OVERDUE. Run before reads so the UI is always accurate;
 * the scheduled reminders job (Phase 7) does the same thing in the background.
 */
export async function markOverdue(db: TenantDb) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  await db.invoice.updateMany({
    where: { status: 'SENT', dueDate: { lt: startOfToday } },
    data: { status: 'OVERDUE' },
  });
}

/** Line items + totals ready to write, computed server-side (never trust client totals). */
export function buildItems(
  items: { description: string; quantity: number; unitPriceCents: number }[],
  taxRateBps: number,
) {
  const rows = items.map((item, position) => ({
    description: item.description,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    amountCents: lineAmountCents(item),
    position,
  }));
  return { rows, totals: computeTotals(items, taxRateBps) };
}

export function formatInvoiceNumber(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function toInvoiceDto(inv: InvoiceWithRelations) {
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    currency: inv.currency,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    notes: inv.notes,
    taxRateBps: inv.taxRateBps,
    subtotalCents: inv.subtotalCents,
    taxCents: inv.taxCents,
    totalCents: inv.totalCents,
    sentAt: inv.sentAt,
    paidAt: inv.paidAt,
    createdAt: inv.createdAt,
    client: inv.client,
    project: inv.project,
    items: inv.items.map((i) => ({
      id: i.id,
      description: i.description,
      quantity: Number(i.quantity),
      unitPriceCents: i.unitPriceCents,
      amountCents: i.amountCents,
    })),
    payments: inv.payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      method: p.method,
      paidAt: p.paidAt,
    })),
  };
}

export function toPdfData(
  inv: InvoiceWithRelations,
  org: { name: string; address: string | null; brandColor: string },
): InvoicePdfData {
  const dto = toInvoiceDto(inv);
  return { ...dto, organization: org };
}
