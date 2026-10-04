import { Router } from 'express';
import { startOfMonth } from '../lib/plans.js';
import { getTenant } from '../middleware/tenant.js';
import { markOverdue } from '../services/invoice.service.js';
import { usage } from '../services/plan-limits.service.js';

export const dashboardRouter = Router({ mergeParams: true });

dashboardRouter.get('/', async (req, res) => {
  const { db, organization } = getTenant(req);
  await markOverdue(db);

  const monthStart = startOfMonth();
  const lastMonthStart = startOfMonth(new Date(monthStart.getTime() - 1));

  const [
    collected,
    collectedLastMonth,
    open,
    overdue,
    drafts,
    recentInvoices,
    activity,
    planUsage,
  ] = await Promise.all([
    db.payment.aggregate({ where: { paidAt: { gte: monthStart } }, _sum: { amountCents: true } }),
    db.payment.aggregate({
      where: { paidAt: { gte: lastMonthStart, lt: monthStart } },
      _sum: { amountCents: true },
    }),
    db.invoice.aggregate({
      where: { status: { in: ['SENT', 'OVERDUE'] } },
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
    db.invoice.aggregate({
      where: { status: 'OVERDUE' },
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
    db.invoice.count({ where: { status: 'DRAFT' } }),
    db.invoice.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        currency: true,
        dueDate: true,
        client: { select: { name: true, company: true } },
      },
    }),
    db.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { actor: { select: { name: true } } },
    }),
    usage(db, organization),
  ]);

  res.json({
    currency: organization.currency,
    stats: {
      collectedThisMonthCents: collected._sum.amountCents ?? 0,
      collectedLastMonthCents: collectedLastMonth._sum.amountCents ?? 0,
      outstandingCents: open._sum.totalCents ?? 0,
      outstandingCount: open._count._all,
      overdueCents: overdue._sum.totalCents ?? 0,
      overdueCount: overdue._count._all,
      draftCount: drafts,
    },
    recentInvoices,
    activity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: a.metadata,
      actorName: a.actor?.name ?? null,
      createdAt: a.createdAt,
    })),
    usage: planUsage,
  });
});
