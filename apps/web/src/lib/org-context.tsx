import { createContext, useContext } from 'react';
import type { OrgDetail, Permission } from './types';

export const OrgContext = createContext<OrgDetail | null>(null);

/** The organization for the current /app/:orgSlug route. */
export function useCurrentOrg() {
  const org = useContext(OrgContext);
  if (!org) throw new Error('useCurrentOrg must be used inside an /app/:orgSlug route');
  return org;
}

export function useCan(permission: Permission) {
  return useCurrentOrg().permissions.includes(permission);
}
