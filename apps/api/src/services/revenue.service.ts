import { prisma } from '../lib/prisma.js';

/**
 * Revenue analytics. These use raw SQL (date_trunc / joins), which bypasses the tenant-scoping
 * Prisma extension — so every query filters on organizationId explicitly.
 */

const monthKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Collected revenue per calendar month (UTC) for the last `months` months, zero-filled. */
export async function revenueByMonth(organizationId: string, months = 12, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const rows = await prisma.$queryRaw<{ month: Date; total: bigint }[]>`
    SELECT date_trunc('month', p."paidAt") AS month, SUM(p."amountCents")::bigint AS total
    FROM "Payment" p
    WHERE p."organizationId" = ${organizationId} AND p."paidAt" >= ${start}
    GROUP BY 1
    ORDER BY 1`;
  const totals = new Map(rows.map((r) => [monthKey(r.month), Number(r.total)]));

  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    return { month: monthKey(d), totalCents: totals.get(monthKey(d)) ?? 0 };
  });
}

/** Clients ranked by revenue collected over the same window. */
export async function topClients(organizationId: string, months = 12, limit = 5, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const rows = await prisma.$queryRaw<
    { id: string; name: string; company: string | null; total: bigint }[]
  >`
    SELECT c.id, c.name, c.company, SUM(p."amountCents")::bigint AS total
    FROM "Payment" p
    JOIN "Invoice" i ON i.id = p."invoiceId"
    JOIN "Client" c ON c.id = i."clientId"
    WHERE p."organizationId" = ${organizationId} AND i."organizationId" = ${organizationId}
      AND p."paidAt" >= ${start}
    GROUP BY c.id, c.name, c.company
    ORDER BY total DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ id: r.id, name: r.company || r.name, totalCents: Number(r.total) }));
}
