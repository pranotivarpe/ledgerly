import type { Organization } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import { PLAN_LIMITS, PLAN_NAMES, startOfMonth } from '../lib/plans.js';
import type { TenantDb } from '../lib/tenant.js';

export async function usage(db: TenantDb, org: Organization) {
  const [activeClients, invoicesThisMonth] = await Promise.all([
    db.client.count({ where: { archivedAt: null } }),
    db.invoice.count({ where: { createdAt: { gte: startOfMonth() } } }),
  ]);
  return { activeClients, invoicesThisMonth, limits: PLAN_LIMITS[org.plan] };
}

export async function assertCanAddClient(db: TenantDb, org: Organization) {
  const limit = PLAN_LIMITS[org.plan].clients;
  if (limit === null) return;
  const active = await db.client.count({ where: { archivedAt: null } });
  if (active >= limit) {
    throw HttpError.paymentRequired(
      `Your ${PLAN_NAMES[org.plan]} plan includes ${limit} active clients. Upgrade for unlimited clients, or archive one you no longer work with.`,
    );
  }
}

export async function assertCanCreateInvoice(db: TenantDb, org: Organization) {
  const limit = PLAN_LIMITS[org.plan].invoicesPerMonth;
  if (limit === null) return;
  const count = await db.invoice.count({ where: { createdAt: { gte: startOfMonth() } } });
  if (count >= limit) {
    throw HttpError.paymentRequired(
      `Your ${PLAN_NAMES[org.plan]} plan includes ${limit} invoices per month. Upgrade for unlimited invoices.`,
    );
  }
}
