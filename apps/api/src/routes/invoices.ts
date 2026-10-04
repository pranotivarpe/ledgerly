import { Router, type Request } from 'express';
import { createElement } from 'react';
import { z } from 'zod';
import { InvoiceEmail } from '../emails/invoice-email.js';
import type { InvoiceStatus } from '../generated/prisma/enums.js';
import { logActivity } from '../lib/activity.js';
import { sendEmail } from '../lib/email.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { formatMoney } from '../lib/money.js';
import { prisma } from '../lib/prisma.js';
import { getTenant, requirePermission } from '../middleware/tenant.js';
import { parseBody } from '../middleware/validate.js';
import { renderInvoicePdf } from '../pdf/invoice-pdf.js';
import {
  buildItems,
  formatInvoiceNumber,
  invoiceInclude,
  markOverdue,
  toInvoiceDto,
  toPdfData,
} from '../services/invoice.service.js';
import { assertCanCreateInvoice } from '../services/plan-limits.service.js';
import { invoicePayLink } from '../services/portal.service.js';

export const invoicesRouter = Router({ mergeParams: true });

const STATUSES = ['DRAFT', 'SENT', 'OVERDUE', 'PAID', 'VOID'] as const;

const itemSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(500),
  quantity: z.number().positive('Must be more than 0').max(1_000_000),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
});

const invoiceSchema = z
  .object({
    clientId: z.string().min(1, 'Choose a client'),
    projectId: z.string().min(1).nullable().optional(),
    issueDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    taxRateBps: z.number().int().min(0).max(10_000).default(0),
    notes: z
      .string()
      .trim()
      .max(2000)
      .transform((v) => v || null)
      .nullable()
      .optional(),
    items: z.array(itemSchema).min(1, 'Add at least one line item').max(100),
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    path: ['dueDate'],
    message: 'Due date must be on or after the issue date',
  });

const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const ALLOWED: Record<string, InvoiceStatus[]> = {
  edit: ['DRAFT'],
  delete: ['DRAFT'],
  send: ['DRAFT', 'SENT', 'OVERDUE'],
  markPaid: ['SENT', 'OVERDUE'],
  void: ['SENT', 'OVERDUE'],
};

function assertStatus(status: InvoiceStatus, action: keyof typeof ALLOWED, message: string) {
  if (!ALLOWED[action]!.includes(status)) throw HttpError.conflict(message);
}

async function loadInvoice(req: Request) {
  const { db } = getTenant(req);
  const invoice = await db.invoice.findUnique({
    where: { id: String(req.params.invoiceId) },
    include: invoiceInclude,
  });
  if (!invoice) throw HttpError.notFound('Invoice not found');
  return invoice;
}

/** Client (and optional project) must exist in this tenant, and the project must belong to the client. */
async function assertRelations(req: Request, clientId: string, projectId?: string | null) {
  const { db } = getTenant(req);
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client)
    throw HttpError.badRequest('Client not found', {
      fieldErrors: { clientId: ['Client not found'] },
    });
  if (projectId) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { clientId: true },
    });
    if (!project || project.clientId !== clientId) {
      throw HttpError.badRequest('Project not found for this client', {
        fieldErrors: { projectId: ['Pick a project that belongs to this client'] },
      });
    }
  }
}

// ─── Read ────────────────────────────────────────────────────────────────────

invoicesRouter.get('/', async (req, res) => {
  const { db } = getTenant(req);
  const { status, clientId, projectId, q, page, pageSize } = listQuery.parse(req.query);
  await markOverdue(db);

  const where = {
    clientId,
    projectId,
    ...(q && {
      OR: [
        { number: { contains: q, mode: 'insensitive' as const } },
        { client: { name: { contains: q, mode: 'insensitive' as const } } },
        { client: { company: { contains: q, mode: 'insensitive' as const } } },
      ],
    }),
  };

  const [invoices, total, byStatus] = await Promise.all([
    db.invoice.findMany({
      where: { ...where, status },
      orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { id: true, name: true, company: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    db.invoice.count({ where: { ...where, status } }),
    db.invoice.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<InvoiceStatus, number>;
  for (const row of byStatus) counts[row.status] = row._count._all;

  res.json({
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      currency: i.currency,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      totalCents: i.totalCents,
      client: i.client,
      project: i.project,
    })),
    pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    counts,
  });
});

invoicesRouter.get('/:invoiceId', async (req, res) => {
  const { db } = getTenant(req);
  await markOverdue(db);
  const invoice = await loadInvoice(req);
  res.json({ invoice: toInvoiceDto(invoice) });
});

invoicesRouter.get('/:invoiceId/pdf', async (req, res) => {
  const { organization } = getTenant(req);
  const invoice = await loadInvoice(req);
  const pdf = await renderInvoicePdf(toPdfData(invoice, organization));

  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res
    .type('application/pdf')
    .set('Content-Disposition', `${disposition}; filename="${invoice.number}.pdf"`)
    .set('Cache-Control', 'private, no-store')
    .send(pdf);
});

// ─── Write ───────────────────────────────────────────────────────────────────

invoicesRouter.post('/', requirePermission('invoices:write'), async (req, res) => {
  const { db, organization } = getTenant(req);
  const input = parseBody(invoiceSchema, req);
  await assertCanCreateInvoice(db, organization);
  await assertRelations(req, input.clientId, input.projectId);

  const { rows, totals } = buildItems(input.items, input.taxRateBps);

  const invoice = await prisma.$transaction(async (tx) => {
    // Atomic per-organization sequence: concurrent creates can never get the same number.
    const org = await tx.organization.update({
      where: { id: organization.id },
      data: { nextInvoiceNumber: { increment: 1 } },
      select: { nextInvoiceNumber: true, invoicePrefix: true, currency: true },
    });
    return tx.invoice.create({
      data: {
        organizationId: organization.id,
        clientId: input.clientId,
        projectId: input.projectId ?? null,
        number: formatInvoiceNumber(org.invoicePrefix, org.nextInvoiceNumber - 1),
        currency: org.currency,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        taxRateBps: input.taxRateBps,
        notes: input.notes ?? null,
        ...totals,
        items: { create: rows },
      },
      include: invoiceInclude,
    });
  });

  await logActivity(
    req,
    'invoice.created',
    { type: 'invoice', id: invoice.id },
    { number: invoice.number },
  );
  res.status(201).json({ invoice: toInvoiceDto(invoice) });
});

invoicesRouter.put('/:invoiceId', requirePermission('invoices:write'), async (req, res) => {
  const existing = await loadInvoice(req);
  assertStatus(
    existing.status,
    'edit',
    'Only draft invoices can be edited. Void it and duplicate it instead.',
  );
  const input = parseBody(invoiceSchema, req);
  await assertRelations(req, input.clientId, input.projectId);

  const { rows, totals } = buildItems(input.items, input.taxRateBps);

  // Items are replaced wholesale inside one transaction, guarded on DRAFT status.
  const invoice = await prisma.$transaction(async (tx) => {
    const { count } = await tx.invoice.updateMany({
      where: { id: existing.id, organizationId: existing.organizationId, status: 'DRAFT' },
      data: {
        clientId: input.clientId,
        projectId: input.projectId ?? null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        taxRateBps: input.taxRateBps,
        notes: input.notes ?? null,
        ...totals,
      },
    });
    if (count === 0) throw HttpError.conflict('Only draft invoices can be edited');
    await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
    await tx.invoiceItem.createMany({ data: rows.map((r) => ({ ...r, invoiceId: existing.id })) });
    return tx.invoice.findUniqueOrThrow({ where: { id: existing.id }, include: invoiceInclude });
  });

  await logActivity(
    req,
    'invoice.updated',
    { type: 'invoice', id: invoice.id },
    { number: invoice.number },
  );
  res.json({ invoice: toInvoiceDto(invoice) });
});

invoicesRouter.delete('/:invoiceId', requirePermission('invoices:write'), async (req, res) => {
  const { db } = getTenant(req);
  const invoice = await loadInvoice(req);
  assertStatus(invoice.status, 'delete', 'Only drafts can be deleted. Void the invoice instead.');

  await db.invoice.delete({ where: { id: invoice.id } });
  await logActivity(
    req,
    'invoice.deleted',
    { type: 'invoice', id: invoice.id },
    { number: invoice.number },
  );
  res.status(204).end();
});

invoicesRouter.post('/:invoiceId/send', requirePermission('invoices:write'), async (req, res) => {
  const { db, organization } = getTenant(req);
  const invoice = await loadInvoice(req);
  assertStatus(invoice.status, 'send', `A ${invoice.status.toLowerCase()} invoice can't be sent`);

  const isReminder = invoice.status !== 'DRAFT';
  const [pdf, payUrl] = await Promise.all([
    renderInvoicePdf(toPdfData(invoice, organization)),
    invoicePayLink(organization, invoice),
  ]);
  const dueDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(invoice.dueDate);

  try {
    await sendEmail({
      to: invoice.client.email,
      subject: `${isReminder ? 'Reminder: ' : ''}Invoice ${invoice.number} from ${organization.name}`,
      template: createElement(InvoiceEmail, {
        organizationName: organization.name,
        clientName: invoice.client.name,
        invoiceNumber: invoice.number,
        amount: formatMoney(invoice.totalCents, invoice.currency),
        dueDate,
        reminder: isReminder,
        payUrl,
      }),
      attachments: [{ filename: `${invoice.number}.pdf`, content: pdf }],
    });
  } catch (err) {
    logger.error({ err, invoiceId: invoice.id }, 'failed to send invoice email');
    throw new HttpError(
      502,
      "The invoice email couldn't be delivered. Please try again.",
      'EMAIL_FAILED',
    );
  }

  await db.invoice.update({
    where: { id: invoice.id },
    data: {
      status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
      sentAt: invoice.sentAt ?? new Date(),
      ...(isReminder && { lastReminderAt: new Date() }),
    },
  });

  await logActivity(
    req,
    isReminder ? 'invoice.reminder_sent' : 'invoice.sent',
    { type: 'invoice', id: invoice.id },
    {
      number: invoice.number,
      to: invoice.client.email,
    },
  );
  await markOverdue(db); // a draft sent with a past due date is immediately overdue
  res.json({ invoice: toInvoiceDto(await loadInvoice(req)) });
});

const markPaidSchema = z.object({ paidAt: z.coerce.date().optional() });

invoicesRouter.post(
  '/:invoiceId/mark-paid',
  requirePermission('invoices:write'),
  async (req, res) => {
    const { db, organization } = getTenant(req);
    const invoice = await loadInvoice(req);
    assertStatus(invoice.status, 'markPaid', 'Only sent or overdue invoices can be marked as paid');
    const { paidAt = new Date() } = parseBody(markPaidSchema, req);

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          organizationId: organization.id,
          invoiceId: invoice.id,
          amountCents: invoice.totalCents,
          currency: invoice.currency,
          method: 'MANUAL',
          paidAt,
        },
      }),
      prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID', paidAt } }),
    ]);

    await logActivity(
      req,
      'invoice.paid',
      { type: 'invoice', id: invoice.id },
      {
        number: invoice.number,
        method: 'MANUAL',
        amountCents: invoice.totalCents,
      },
    );
    const updated = await db.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: invoiceInclude,
    });
    res.json({ invoice: toInvoiceDto(updated) });
  },
);

invoicesRouter.post('/:invoiceId/void', requirePermission('invoices:write'), async (req, res) => {
  const { db } = getTenant(req);
  const invoice = await loadInvoice(req);
  assertStatus(invoice.status, 'void', 'Only sent or overdue invoices can be voided');

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: { status: 'VOID' },
    include: invoiceInclude,
  });
  await logActivity(
    req,
    'invoice.voided',
    { type: 'invoice', id: invoice.id },
    { number: invoice.number },
  );
  res.json({ invoice: toInvoiceDto(updated) });
});

/** New draft with the same client, project, items and payment terms, dated today. */
invoicesRouter.post(
  '/:invoiceId/duplicate',
  requirePermission('invoices:write'),
  async (req, res) => {
    const { db, organization } = getTenant(req);
    const source = await loadInvoice(req);
    await assertCanCreateInvoice(db, organization);

    const termMs = source.dueDate.getTime() - source.issueDate.getTime();
    const issueDate = new Date();
    issueDate.setHours(0, 0, 0, 0);

    const invoice = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: organization.id },
        data: { nextInvoiceNumber: { increment: 1 } },
        select: { nextInvoiceNumber: true, invoicePrefix: true },
      });
      return tx.invoice.create({
        data: {
          organizationId: organization.id,
          clientId: source.clientId,
          projectId: source.projectId,
          number: formatInvoiceNumber(org.invoicePrefix, org.nextInvoiceNumber - 1),
          currency: source.currency,
          issueDate,
          dueDate: new Date(issueDate.getTime() + termMs),
          taxRateBps: source.taxRateBps,
          notes: source.notes,
          subtotalCents: source.subtotalCents,
          taxCents: source.taxCents,
          totalCents: source.totalCents,
          items: {
            create: source.items.map((i) => ({
              description: i.description,
              quantity: i.quantity,
              unitPriceCents: i.unitPriceCents,
              amountCents: i.amountCents,
              position: i.position,
            })),
          },
        },
        include: invoiceInclude,
      });
    });

    await logActivity(
      req,
      'invoice.created',
      { type: 'invoice', id: invoice.id },
      {
        number: invoice.number,
        duplicatedFrom: source.number,
      },
    );
    res.status(201).json({ invoice: toInvoiceDto(invoice) });
  },
);
