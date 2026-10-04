import type { Role } from '../generated/prisma/enums.js';

/**
 * Single source of truth for role-based access control.
 * Routes call `can(role, action)` (via the requirePermission middleware) — never compare roles inline.
 */
const PERMISSIONS = {
  'org:update': ['OWNER', 'ADMIN'],
  'org:delete': ['OWNER'],
  'billing:manage': ['OWNER'],
  'members:invite': ['OWNER', 'ADMIN'],
  'members:update': ['OWNER', 'ADMIN'],
  'members:remove': ['OWNER', 'ADMIN'],
  'clients:write': ['OWNER', 'ADMIN', 'MEMBER'],
  'projects:write': ['OWNER', 'ADMIN', 'MEMBER'],
  'invoices:write': ['OWNER', 'ADMIN', 'MEMBER'],
  'reports:view': ['OWNER', 'ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Exposed to the frontend so the UI can hide actions the user can't perform. */
export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}
