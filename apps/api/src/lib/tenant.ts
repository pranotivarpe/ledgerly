import { prisma } from './prisma.js';

/**
 * Tenant isolation.
 *
 * `forTenant(orgId)` returns a Prisma client where every query against a tenant-owned model is
 * automatically constrained to that organization:
 *   - reads / updates / deletes get `organizationId` added to their `where`
 *   - creates get `organizationId` stamped onto their `data`
 *
 * Route handlers receive this client as `req.tenant.db` and never see the raw client, so a missing
 * `where: { organizationId }` can't leak another agency's data.
 *
 * Child tables without their own `organizationId` (e.g. InvoiceItem) are only reached through
 * their tenant-scoped parent.
 */
const TENANT_MODELS = new Set([
  'Membership',
  'Invitation',
  'Client',
  'ClientContact',
  'Project',
  'Invoice',
  'Payment',
  'ActivityLog',
]);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

type AnyArgs = Record<string, any>;

export function forTenant(organizationId: string) {
  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          const a = (args ?? {}) as AnyArgs;

          if (WHERE_OPERATIONS.has(operation)) {
            a.where = { ...a.where, organizationId };
          } else if (operation === 'create') {
            a.data = { ...a.data, organizationId };
          } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            a.data = rows.map((row: AnyArgs) => ({ ...row, organizationId }));
          } else if (operation === 'upsert') {
            a.where = { ...a.where, organizationId };
            a.create = { ...a.create, organizationId };
          }

          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof forTenant>;
