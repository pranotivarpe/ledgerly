import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { meQueryKey } from './auth';
import type { OrgSummary, Role } from './types';

export function useDemoAvailability() {
  return useQuery({
    queryKey: ['demo'],
    queryFn: () => api<{ enabled: boolean; portalSlug: string | null }>('/auth/demo'),
    staleTime: Infinity,
    retry: false,
  });
}

export function useDemoLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: Role) =>
      api<{ organization: OrgSummary }>('/auth/demo', { method: 'POST', body: { role } }).then(
        (r) => r.organization,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: meQueryKey }),
  });
}

export function usePortalDemoLogin(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/portal/${slug}/demo`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', slug] }),
  });
}
