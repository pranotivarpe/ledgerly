import type { PlanId } from './plans';

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

export type Permission =
  | 'org:update'
  | 'org:delete'
  | 'billing:manage'
  | 'members:invite'
  | 'members:update'
  | 'members:remove'
  | 'clients:write'
  | 'projects:write'
  | 'invoices:write'
  | 'reports:view';

export type User = { id: string; name: string; email: string; avatarUrl: string | null };

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  plan: PlanId;
  brandColor: string;
  role: Role;
};

export type OrgDetail = OrgSummary & {
  logoUrl: string | null;
  currency: string;
  address: string | null;
  invoicePrefix: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  permissions: Permission[];
};

export type Me = { user: User; organizations: OrgSummary[] };
