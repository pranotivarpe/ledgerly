import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { Me, OrgDetail, OrgSummary, User } from './types';

export const meQueryKey = ['me'] as const;

/** Current user + their organizations; `null` when logged out. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    // /auth/session refreshes an expired access token itself and answers `user: null` (not 401)
    // when logged out, so a first visit doesn't log failed requests in the console.
    queryFn: async () => {
      const session = await api<Me | { user: null }>('/auth/session');
      return session.user ? (session as Me) : null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  organizationName?: string;
  inviteToken?: string;
};
export type LoginInput = { email: string; password: string };

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignupInput) =>
      api<{ user: User; organizations: OrgSummary[] }>('/auth/signup', {
        method: 'POST',
        body: input,
      }),
    onSuccess: (data) => qc.setQueryData<Me>(meQueryKey, data),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<{ user: User }>('/auth/login', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meQueryKey }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(meQueryKey, null);
    },
  });
}

export function useOrg(slug: string | undefined) {
  return useQuery({
    queryKey: ['org', slug],
    queryFn: () => api<{ organization: OrgDetail }>(`/orgs/${slug}`).then((r) => r.organization),
    enabled: Boolean(slug),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
}

export function useCreateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      api<{ organization: OrgSummary }>('/orgs', { method: 'POST', body: input }).then(
        (r) => r.organization,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: meQueryKey }),
  });
}

export function useUpdateOrg(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Partial<
        Pick<OrgDetail, 'name' | 'currency' | 'address' | 'brandColor' | 'invoicePrefix'>
      >,
    ) =>
      api<{ organization: OrgDetail }>(`/orgs/${slug}`, { method: 'PATCH', body: input }).then(
        (r) => r.organization,
      ),
    onSuccess: (org) => {
      qc.setQueryData(['org', slug], org);
      qc.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}
