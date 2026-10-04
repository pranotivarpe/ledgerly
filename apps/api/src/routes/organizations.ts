import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { toOrgDetail, toOrgSummary } from '../lib/serializers.js';
import { uniqueOrgSlug } from '../lib/slug.js';
import { requireAuth } from '../middleware/auth.js';
import { getAuth, getTenant, loadTenant, requirePermission } from '../middleware/tenant.js';
import { parseBody } from '../middleware/validate.js';
import { teamRouter } from './team.js';

export const organizationsRouter = Router();

organizationsRouter.use(requireAuth);

const createSchema = z.object({ name: z.string().trim().min(2).max(80) });

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    currency: z.enum(['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD']),
    address: z.string().trim().max(500).nullable(),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour like #4f46e5'),
    invoicePrefix: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(/^[A-Z0-9-]+$/, 'Use capital letters, numbers and dashes'),
  })
  .partial();

/** Create an additional organization; the creator becomes its owner. */
organizationsRouter.post('/', async (req, res) => {
  const { userId } = getAuth(req);
  const { name } = parseBody(createSchema, req);

  const organization = await prisma.organization.create({
    data: {
      name,
      slug: await uniqueOrgSlug(name),
      memberships: { create: { userId, role: 'OWNER' } },
      activity: { create: { actorId: userId, action: 'organization.created' } },
    },
  });

  res.status(201).json({ organization: toOrgSummary(organization, 'OWNER') });
});

// Everything below is scoped to one organization the user is a member of.
const orgRouter = Router({ mergeParams: true });
organizationsRouter.use('/:orgSlug', loadTenant, orgRouter);
orgRouter.use(teamRouter);

orgRouter.get('/', (req, res) => {
  const { organization, role } = getTenant(req);
  res.json({ organization: toOrgDetail(organization, role) });
});

orgRouter.patch('/', requirePermission('org:update'), async (req, res) => {
  const { organization, role, db } = getTenant(req);
  const { userId } = getAuth(req);
  const data = parseBody(updateSchema, req);

  const updated = await prisma.organization.update({ where: { id: organization.id }, data });
  await db.activityLog.create({
    data: {
      organizationId: organization.id,
      actorId: userId,
      action: 'organization.updated',
      metadata: { fields: Object.keys(data) },
    },
  });

  res.json({ organization: toOrgDetail(updated, role) });
});
