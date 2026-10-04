import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { toQueryString, useInvalidateOrg } from './queries';

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'OVERDUE' | 'PAID' | 'VOID';

export const INVOICE_STATUS: Record<
  InvoiceStatus,
  { label: string; variant: 'neutral' | 'default' | 'danger' | 'success' | 'warning' }
> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  SENT: { label: 'Sent', variant: 'default' },
  OVERDUE: { label: 'Overdue', variant: 'danger' },
  PAID: { label: 'Paid', variant: 'success' },
  VOID: { label: 'Void', variant: 'neutral' },
};

export type InvoiceListItem = {
  id: string;
  number: string;
  status: InvoiceStatus;
  currency: string;
  issueDate: string;
  dueDate: string;
  totalCents: number;
  client: { id: string; name: string; company: string | null };
  project: { id: string; name: string } | null;
};

export type Invoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  currency: string;
  issueDate: string;
  dueDate: string;
  notes: string | null;
  taxRateBps: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  client: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    address: string | null;
  };
  project: { id: string; name: string } | null;
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    amountCents: number;
  }[];
  payments: { id: string; amountCents: number; method: 'STRIPE' | 'MANUAL'; paidAt: string }[];
};

export type InvoiceInput = {
  clientId: string;
  projectId: string | null;
  issueDate: string;
  dueDate: string;
  taxRateBps: number;
  notes: string | null;
  items: { description: string; quantity: number; unitPriceCents: number }[];
};

export type InvoiceListParams = {
  status?: InvoiceStatus;
  clientId?: string;
  q?: string;
  page?: number;
};

export function useInvoices(slug: string, params: InvoiceListParams = {}) {
  return useQuery({
    queryKey: ['org', slug, 'invoices', params],
    queryFn: () =>
      api<{
        invoices: InvoiceListItem[];
        pagination: { page: number; pageSize: number; total: number; pageCount: number };
        counts: Record<InvoiceStatus, number>;
      }>(`/orgs/${slug}/invoices${toQueryString(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(slug: string, id: string | undefined) {
  return useQuery({
    queryKey: ['org', slug, 'invoices', 'detail', id],
    queryFn: () => api<{ invoice: Invoice }>(`/orgs/${slug}/invoices/${id}`).then((r) => r.invoice),
    enabled: Boolean(id),
  });
}

export function useSaveInvoice(slug: string, id?: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: (input: InvoiceInput) =>
      api<{ invoice: Invoice }>(id ? `/orgs/${slug}/invoices/${id}` : `/orgs/${slug}/invoices`, {
        method: id ? 'PUT' : 'POST',
        body: input,
      }).then((r) => r.invoice),
    onSuccess: invalidate,
  });
}

export type InvoiceAction = 'send' | 'mark-paid' | 'void' | 'duplicate';

export function useInvoiceAction(slug: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: InvoiceAction; body?: unknown }) =>
      api<{ invoice: Invoice }>(`/orgs/${slug}/invoices/${id}/${action}`, {
        method: 'POST',
        body: body ?? {},
      }).then((r) => r.invoice),
    onSuccess: invalidate,
  });
}

export function useDeleteInvoice(slug: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: (id: string) => api<void>(`/orgs/${slug}/invoices/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function invoicePdfUrl(slug: string, id: string, download = false) {
  return `/api/orgs/${slug}/invoices/${id}/pdf${download ? '?download=1' : ''}`;
}
