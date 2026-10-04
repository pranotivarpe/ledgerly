import type { Request } from 'express';
import type { Prisma } from '../generated/prisma/client.js';
import { getAuth, getTenant } from '../middleware/tenant.js';

/** Records an entry in the organization's audit trail (shown in the dashboard activity feed). */
export async function logActivity(
  req: Request,
  action: string,
  entity?: { type: string; id: string },
  metadata?: Prisma.InputJsonValue,
) {
  const { db, organization } = getTenant(req);
  await db.activityLog.create({
    data: {
      organizationId: organization.id,
      actorId: getAuth(req).userId,
      action,
      entityType: entity?.type,
      entityId: entity?.id,
      metadata,
    },
  });
}
