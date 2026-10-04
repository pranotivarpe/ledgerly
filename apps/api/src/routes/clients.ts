import { Router } from 'express';
import { z } from 'zod';
import { logActivity } from '../lib/activity.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { forbidInDemo } from '../middleware/demo.js';
import { getAuth, getTenant, requirePermission } from '../middleware/tenant.js';
import { parseBody } from '../middleware/validate.js';
import { markOverdue } from '../services/invoice.service.js';
import { assertCanAddClient } from '../services/plan-limits.service.js';
import {
  findOrCreateContact,
  INVITE_LINK_TTL_DAYS,
  sendPortalLink,
} from '../services/portal.service.js';

export const clientsRouter = Router({ mergeParams: true });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

const clientSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.email().trim().toLowerCase().max(254),
  company: optionalText(120),
  phone: optionalText(40),
  address: optionalText(500),
  notes: optionalText(2000),
});

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  archived: z.enum(['true', 'false']).optional(),
});

clientsRouter.get('/', async (req, res) => {
  const { db } = getTenant(req);
  const { q, archived } = listQuery.parse(req.query);
  await markOverdue(db);

  const clients = await db.client.findMany({
    where: {
      archivedAt: archived === 'true' ? { not: null } : null,
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: { name: 'asc' },
    include: { _count: { select: { projects: true, invoices: true } } },
  });

  // Outstanding balance per client in one grouped query.
  const balances = await db.invoice.groupBy({
    by: ['clientId'],
    where: { clientId: { in: clients.map((c) => c.id) }, status: { in: ['SENT', 'OVERDUE'] } },
    _sum: { totalCents: true },
  });
  const outstanding = new Map(balances.map((b) => [b.clientId, b._sum.totalCents ?? 0]));

  res.json({
    clients: clients.map(({ _count, ...c }) => ({
      ...c,
      projectCount: _count.projects,
      invoiceCount: _count.invoices,
      outstandingCents: outstanding.get(c.id) ?? 0,
    })),
  });
});

clientsRouter.post('/', requirePermission('clients:write'), async (req, res) => {
  const { db, organization } = getTenant(req);
  const input = parseBody(clientSchema, req);
  await assertCanAddClient(db, organization);

  const client = await db.client.create({ data: { ...input, organizationId: organization.id } });
  await logActivity(
    req,
    'client.created',
    { type: 'client', id: client.id },
    { name: client.name },
  );
  res.status(201).json({ client });
});

clientsRouter.get('/:clientId', async (req, res) => {
  const { db } = getTenant(req);
  await markOverdue(db);
  const client = await db.client.findUnique({
    where: { id: String(req.params.clientId) },
    include: {
      projects: { orderBy: { createdAt: 'desc' } },
      invoices: {
        orderBy: { issueDate: 'desc' },
        select: {
          id: true,
          number: true,
          status: true,
          totalCents: true,
          currency: true,
          issueDate: true,
          dueDate: true,
        },
      },
    },
  });
  if (!client) throw HttpError.notFound('Client not found');

  const sum = (statuses: string[]) =>
    client.invoices
      .filter((i) => statuses.includes(i.status))
      .reduce((t, i) => t + i.totalCents, 0);

  res.json({
    client,
    stats: {
      outstandingCents: sum(['SENT', 'OVERDUE']),
      paidCents: sum(['PAID']),
      overdueCents: sum(['OVERDUE']),
    },
  });
});

clientsRouter.patch('/:clientId', requirePermission('clients:write'), async (req, res) => {
  const { db, organization } = getTenant(req);
  const input = parseBody(clientSchema.partial().extend({ archived: z.boolean().optional() }), req);
  const { archived, ...fields } = input;

  const existing = await db.client.findUnique({ where: { id: String(req.params.clientId) } });
  if (!existing) throw HttpError.notFound('Client not found');
  if (archived === false && existing.archivedAt) await assertCanAddClient(db, organization);

  const client = await db.client.update({
    where: { id: existing.id },
    data: {
      ...fields,
      ...(archived !== undefined && {
        archivedAt: archived ? (existing.archivedAt ?? new Date()) : null,
      }),
    },
  });

  const action =
    archived === true
      ? 'client.archived'
      : archived === false
        ? 'client.restored'
        : 'client.updated';
  await logActivity(req, action, { type: 'client', id: client.id }, { name: client.name });
  res.json({ client });
});

/** Clients with invoice history can only be archived, so financial records stay intact. */
clientsRouter.delete(
  '/:clientId',
  requirePermission('clients:write'),
  forbidInDemo,
  async (req, res) => {
    const { db } = getTenant(req);
    const client = await db.client.findUnique({
      where: { id: String(req.params.clientId) },
      include: { _count: { select: { invoices: true } } },
    });
    if (!client) throw HttpError.notFound('Client not found');
    if (client._count.invoices > 0) {
      throw HttpError.conflict(
        'This client has invoices. Archive it instead to keep your records.',
      );
    }

    await db.client.delete({ where: { id: client.id } });
    await logActivity(
      req,
      'client.deleted',
      { type: 'client', id: client.id },
      { name: client.name },
    );
    res.status(204).end();
  },
);

/** Emails the client a 7-day sign-in link to the client portal. */
clientsRouter.post(
  '/:clientId/portal-invite',
  requirePermission('clients:write'),
  async (req, res) => {
    const { db, organization } = getTenant(req);
    const client = await db.client.findUnique({ where: { id: String(req.params.clientId) } });
    if (!client || client.archivedAt) throw HttpError.notFound('Client not found');

    const contact = await findOrCreateContact(organization.id, client.email);
    if (!contact || contact.clientId !== client.id) {
      throw HttpError.conflict(
        `${client.email} is already used as the portal login for another client`,
      );
    }
    const inviter = await prisma.user.findUniqueOrThrow({
      where: { id: getAuth(req).userId },
      select: { name: true },
    });
    await sendPortalLink(organization, contact, {
      ttlMs: INVITE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
      next: `/portal/${organization.slug}/invoices`,
      invitedBy: inviter.name,
    });
    await logActivity(
      req,
      'client.portal_invited',
      { type: 'client', id: client.id },
      { name: client.name, email: client.email },
    );
    res.json({ sent: true });
  },
);
