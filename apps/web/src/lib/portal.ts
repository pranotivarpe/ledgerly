import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { Invoice, InvoiceStatus } from './invoices';

export type PortalOrg = {
  name: string;
  slug: string;
  brandColor: string;
  logoUrl: string | null;
  isDemo: boolean;
};

export type PortalMe = {
  contact: { name: string; email: string };
  client: { name: string; company: string | null };
  organization: { name: string; slug: string; brandColor: string };
};

export type PortalInvoiceListItem = {
  id: string;
  number: string;
  status: InvoiceStatus;
  currency: string;
  issueDate: string;
  dueDate: string;
  totalCents: number;
  paidAt: string | null;
  project: { name: string } | null;
};

const keys = {
  info: (slug: string) => ['portal', slug, 'info'] as const,
  me: (slug: string) => ['portal', slug, 'me'] as const,
};

export function usePortalInfo(slug: string) {
  return useQuery({
    queryKey: keys.info(slug),
    queryFn: () =>
      api<{ organization: PortalOrg }>(`/portal/${slug}/info`).then((r) => r.organization),
    retry: false,
    staleTime: Infinity,
  });
}

/** The signed-in client contact, or null when there's no portal session. */
export function usePortalMe(slug: string) {
  return useQuery({
    queryKey: keys.me(slug),
    queryFn: async () => {
      try {
        return await api<PortalMe>(`/portal/${slug}/me`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
  });
}

export function useRequestPortalLink(slug: string) {
  return useMutation({
    mutationFn: (input: { email: string; next?: string }) =>
      api<{ ok: true }>(`/portal/${slug}/magic-link`, { method: 'POST', body: input }),
  });
}

export function useVerifyPortalLink(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api(`/portal/${slug}/verify`, { method: 'POST', body: { token } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', slug] }),
  });
}

export function usePortalLogout(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/portal/${slug}/logout`, { method: 'POST' }),
    onSettled: () => {
      qc.setQueryData(keys.me(slug), null);
      qc.removeQueries({ queryKey: ['portal', slug, 'invoices'] });
    },
  });
}

export function usePortalInvoices(slug: string) {
  return useQuery({
    queryKey: ['portal', slug, 'invoices'],
    queryFn: () =>
      api<{ invoices: PortalInvoiceListItem[]; outstandingCents: number }>(
        `/portal/${slug}/invoices`,
      ),
  });
}

export function usePortalInvoice(slug: string, id: string | undefined) {
  return useQuery({
    queryKey: ['portal', slug, 'invoices', id],
    queryFn: () =>
      api<{
        invoice: Invoice;
        organization: { name: string; address: string | null; brandColor: string };
      }>(`/portal/${slug}/invoices/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function usePayInvoice(slug: string) {
  return useMutation({
    mutationFn: (id: string) =>
      api<{ url: string }>(`/portal/${slug}/invoices/${id}/pay`, { method: 'POST' }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

export function useConfirmPayment(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sessionId }: { id: string; sessionId: string }) =>
      api<{ invoice: Invoice; paid: boolean }>(`/portal/${slug}/invoices/${id}/confirm`, {
        method: 'POST',
        body: { sessionId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', slug, 'invoices'] }),
  });
}

export function portalPdfUrl(slug: string, id: string, download = false) {
  return `/api/portal/${slug}/invoices/${id}/pdf${download ? '?download=1' : ''}`;
}
