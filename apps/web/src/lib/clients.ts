import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { toQueryString, useInvalidateOrg } from './queries';
import type { InvoiceStatus } from './invoices';

export type Client = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type ClientListItem = Client & {
  projectCount: number;
  invoiceCount: number;
  outstandingCents: number;
};

export type ClientDetail = Client & {
  projects: {
    id: string;
    name: string;
    status: string;
    dueDate: string | null;
    budgetCents: number | null;
  }[];
  invoices: {
    id: string;
    number: string;
    status: InvoiceStatus;
    totalCents: number;
    currency: string;
    issueDate: string;
    dueDate: string;
  }[];
};

export type ClientInput = {
  name: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

export function useClients(slug: string, params: { q?: string; archived?: boolean } = {}) {
  return useQuery({
    queryKey: ['org', slug, 'clients', params],
    queryFn: () =>
      api<{ clients: ClientListItem[] }>(
        `/orgs/${slug}/clients${toQueryString({ q: params.q, archived: params.archived || undefined })}`,
      ).then((r) => r.clients),
    placeholderData: keepPreviousData,
  });
}

export function useClient(slug: string, id: string | undefined) {
  return useQuery({
    queryKey: ['org', slug, 'clients', 'detail', id],
    queryFn: () =>
      api<{
        client: ClientDetail;
        stats: { outstandingCents: number; paidCents: number; overdueCents: number };
      }>(`/orgs/${slug}/clients/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateClient(slug: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: (input: ClientInput) =>
      api<{ client: Client }>(`/orgs/${slug}/clients`, { method: 'POST', body: input }).then(
        (r) => r.client,
      ),
    onSuccess: invalidate,
  });
}

export function useUpdateClient(slug: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<ClientInput> & { id: string; archived?: boolean }) =>
      api<{ client: Client }>(`/orgs/${slug}/clients/${id}`, { method: 'PATCH', body: input }).then(
        (r) => r.client,
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteClient(slug: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: (id: string) => api<void>(`/orgs/${slug}/clients/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function usePortalInvite(slug: string) {
  return useMutation({
    mutationFn: (clientId: string) =>
      api<{ sent: true }>(`/orgs/${slug}/clients/${clientId}/portal-invite`, { method: 'POST' }),
  });
}
