import { createContext, useContext } from 'react';
import type { OrgDetail, Permission } from './types';

export const OrgContext = createContext<OrgDetail | null>(null);

/** The organization for the current /app/:orgSlug route. */
export function useCurrentOrg() {
  const org = useContext(OrgContext);
  if (!org) throw new Error('useCurrentOrg must be used inside an /app/:orgSlug route');
  return org;
}

/** Actions the API refuses in the shared demo workspace (mirrors the forbidInDemo middleware). */
const DEMO_BLOCKED: Permission[] = [
  'org:update',
  'billing:manage',
  'members:invite',
  'members:update',
  'members:remove',
];

export function useCan(permission: Permission) {
  const org = useCurrentOrg();
  if (org.isDemo && DEMO_BLOCKED.includes(permission)) return false;
  return org.permissions.includes(permission);
}
