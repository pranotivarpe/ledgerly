import { Router } from 'express';
import { z } from 'zod';
import { logActivity } from '../lib/activity.js';
import { HttpError } from '../lib/http-error.js';
import { getTenant, requirePermission } from '../middleware/tenant.js';
import { parseBody } from '../middleware/validate.js';

export const projectsRouter = Router({ mergeParams: true });

const dateOrNull = z.coerce.date().nullable().optional();

const projectSchema = z.object({
  clientId: z.string().min(1, 'Choose a client'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED']).default('ACTIVE'),
  budgetCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  startDate: dateOrNull,
  dueDate: dateOrNull,
});

const listQuery = z.object({
  clientId: z.string().optional(),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED']).optional(),
  q: z.string().trim().max(100).optional(),
});

projectsRouter.get('/', async (req, res) => {
  const { db } = getTenant(req);
  const { clientId, status, q } = listQuery.parse(req.query);

  const projects = await db.project.findMany({
    where: {
      clientId,
      status,
      ...(q && { name: { contains: q, mode: 'insensitive' } }),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      client: { select: { id: true, name: true, company: true } },
      _count: { select: { invoices: true } },
    },
  });

  const billed = await db.invoice.groupBy({
    by: ['projectId'],
    where: { projectId: { in: projects.map((p) => p.id) }, status: { not: 'VOID' } },
    _sum: { totalCents: true },
  });
  const billedById = new Map(billed.map((b) => [b.projectId, b._sum.totalCents ?? 0]));

  res.json({
    projects: projects.map(({ _count, ...p }) => ({
      ...p,
      invoiceCount: _count.invoices,
      billedCents: billedById.get(p.id) ?? 0,
    })),
  });
});

/** Projects must belong to a client in the same tenant — verified through the scoped client. */
async function assertClientInTenant(db: ReturnType<typeof getTenant>['db'], clientId: string) {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client)
    throw HttpError.badRequest('Client not found', {
      fieldErrors: { clientId: ['Client not found'] },
    });
}

projectsRouter.post('/', requirePermission('projects:write'), async (req, res) => {
  const { db, organization } = getTenant(req);
  const input = parseBody(projectSchema, req);
  await assertClientInTenant(db, input.clientId);

  const project = await db.project.create({ data: { ...input, organizationId: organization.id } });
  await logActivity(
    req,
    'project.created',
    { type: 'project', id: project.id },
    { name: project.name },
  );
  res.status(201).json({ project });
});

projectsRouter.patch('/:projectId', requirePermission('projects:write'), async (req, res) => {
  const { db } = getTenant(req);
  const input = parseBody(projectSchema.partial(), req);
  if (input.clientId) await assertClientInTenant(db, input.clientId);

  const existing = await db.project.findUnique({ where: { id: String(req.params.projectId) } });
  if (!existing) throw HttpError.notFound('Project not found');

  const project = await db.project.update({ where: { id: existing.id }, data: input });
  await logActivity(
    req,
    'project.updated',
    { type: 'project', id: project.id },
    { name: project.name },
  );
  res.json({ project });
});

/** Deleting a project keeps its invoices (they just lose the project link). */
projectsRouter.delete('/:projectId', requirePermission('projects:write'), async (req, res) => {
  const { db } = getTenant(req);
  const project = await db.project.findUnique({ where: { id: String(req.params.projectId) } });
  if (!project) throw HttpError.notFound('Project not found');

  await db.project.delete({ where: { id: project.id } });
  await logActivity(
    req,
    'project.deleted',
    { type: 'project', id: project.id },
    { name: project.name },
  );
  res.status(204).end();
});
