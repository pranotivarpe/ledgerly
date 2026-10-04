import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { toQueryString, useInvalidateOrg } from './queries';

export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';

export type Project = {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  budgetCents: number | null;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
};

export type ProjectListItem = Project & {
  client: { id: string; name: string; company: string | null };
  invoiceCount: number;
  billedCents: number;
};

export type ProjectInput = {
  clientId: string;
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  budgetCents?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
};

export const PROJECT_STATUS: Record<
  ProjectStatus,
  { label: string; variant: 'success' | 'warning' | 'neutral' }
> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  ON_HOLD: { label: 'On hold', variant: 'warning' },
  COMPLETED: { label: 'Completed', variant: 'neutral' },
};

export function useProjects(
  slug: string,
  params: { clientId?: string; status?: ProjectStatus; q?: string } = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['org', slug, 'projects', params],
    queryFn: () =>
      api<{ projects: ProjectListItem[] }>(`/orgs/${slug}/projects${toQueryString(params)}`).then(
        (r) => r.projects,
      ),
    enabled: options.enabled ?? true,
  });
}

export function useCreateProject(slug: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: (input: ProjectInput) =>
      api<{ project: Project }>(`/orgs/${slug}/projects`, { method: 'POST', body: input }).then(
        (r) => r.project,
      ),
    onSuccess: invalidate,
  });
}

export function useUpdateProject(slug: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<ProjectInput> & { id: string }) =>
      api<{ project: Project }>(`/orgs/${slug}/projects/${id}`, {
        method: 'PATCH',
        body: input,
      }).then((r) => r.project),
    onSuccess: invalidate,
  });
}

export function useDeleteProject(slug: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: (id: string) => api<void>(`/orgs/${slug}/projects/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
