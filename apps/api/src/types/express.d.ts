import type { Organization, Role } from '../generated/prisma/client.js';
import type { TenantDb } from '../lib/tenant.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. */
      auth?: { userId: string; sessionId: string };
      /** Set by `loadTenant` for routes under /api/orgs/:orgSlug. */
      tenant?: { organization: Organization; role: Role; db: TenantDb };
    }
  }
}

export {};
