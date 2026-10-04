import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { meQueryKey } from './auth';
import type { OrgSummary, Role } from './types';

export type Member = {
  id: string;
  role: Role;
  joinedAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: Role;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
};

export type PublicInvitation = {
  email: string;
  role: Role;
  state: 'pending' | 'accepted' | 'expired';
  organization: { name: string; brandColor: string };
  invitedBy: string;
  userExists: boolean;
};

const keys = {
  members: (slug: string) => ['org', slug, 'members'] as const,
  invitations: (slug: string) => ['org', slug, 'invitations'] as const,
};

export function useMembers(slug: string) {
  return useQuery({
    queryKey: keys.members(slug),
    queryFn: () =>
      api<{ members: Member[]; seats: { used: number; limit: number } }>(`/orgs/${slug}/members`),
  });
}

export function useInvitations(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.invitations(slug),
    queryFn: () =>
      api<{ invitations: PendingInvitation[] }>(`/orgs/${slug}/invitations`).then(
        (r) => r.invitations,
      ),
    enabled,
  });
}

function useInvalidateTeam(slug: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: keys.members(slug) });
    qc.invalidateQueries({ queryKey: keys.invitations(slug) });
  };
}

export function useInvite(slug: string) {
  const invalidate = useInvalidateTeam(slug);
  return useMutation({
    mutationFn: (input: { email: string; role: 'ADMIN' | 'MEMBER' }) =>
      api<{ emailSent: boolean }>(`/orgs/${slug}/invitations`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useResendInvite(slug: string) {
  const invalidate = useInvalidateTeam(slug);
  return useMutation({
    mutationFn: (id: string) =>
      api<{ emailSent: boolean }>(`/orgs/${slug}/invitations/${id}/resend`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useRevokeInvite(slug: string) {
  const invalidate = useInvalidateTeam(slug);
  return useMutation({
    mutationFn: (id: string) => api<void>(`/orgs/${slug}/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useUpdateMemberRole(slug: string) {
  const invalidate = useInvalidateTeam(slug);
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api(`/orgs/${slug}/members/${id}`, { method: 'PATCH', body: { role } }),
    onSuccess: invalidate,
  });
}

export function useRemoveMember(slug: string) {
  const invalidate = useInvalidateTeam(slug);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/orgs/${slug}/members/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

export function usePublicInvitation(token: string) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: () =>
      api<{ invitation: PublicInvitation }>(`/invitations/${token}`).then((r) => r.invitation),
    retry: false,
  });
}

export function useAcceptInvitation(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ organization: OrgSummary }>(`/invitations/${token}/accept`, { method: 'POST' }).then(
        (r) => r.organization,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: meQueryKey }),
  });
}

/** Mirrors the API rule: admins manage members/admins; only owners touch owners. */
export function canManageMember(actor: Role, target: Role) {
  return actor === 'OWNER' || target !== 'OWNER';
}

export function assignableRoles(actor: Role): Role[] {
  return actor === 'OWNER' ? ['OWNER', 'ADMIN', 'MEMBER'] : ['ADMIN', 'MEMBER'];
}

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  OWNER: {
    label: 'Owner',
    description: 'Full access, including billing and deleting the organization.',
  },
  ADMIN: { label: 'Admin', description: 'Manage the team, clients, projects and invoices.' },
  MEMBER: { label: 'Member', description: 'Work with clients, projects and invoices.' },
};
