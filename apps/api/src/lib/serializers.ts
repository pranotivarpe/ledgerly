import type { Organization, Role, User } from '../generated/prisma/client.js';
import { permissionsFor } from './permissions.js';

export function toUserDto(user: User) {
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl };
}

export function toOrgSummary(org: Organization, role: Role) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    brandColor: org.brandColor,
    role,
  };
}

export function toOrgDetail(org: Organization, role: Role) {
  return {
    ...toOrgSummary(org, role),
    logoUrl: org.logoUrl,
    currency: org.currency,
    address: org.address,
    invoicePrefix: org.invoicePrefix,
    subscriptionStatus: org.subscriptionStatus,
    currentPeriodEnd: org.currentPeriodEnd,
    cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    createdAt: org.createdAt,
    permissions: permissionsFor(role),
    isDemo: org.isDemo,
  };
}
