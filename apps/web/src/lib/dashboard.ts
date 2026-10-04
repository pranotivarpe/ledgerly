import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { InvoiceStatus } from './invoices';

export type ActivityItem = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
};

export type Dashboard = {
  currency: string;
  stats: {
    collectedThisMonthCents: number;
    collectedLastMonthCents: number;
    outstandingCents: number;
    outstandingCount: number;
    overdueCents: number;
    overdueCount: number;
    draftCount: number;
  };
  recentInvoices: {
    id: string;
    number: string;
    status: InvoiceStatus;
    totalCents: number;
    currency: string;
    dueDate: string;
    client: { name: string; company: string | null };
  }[];
  activity: ActivityItem[];
  usage: {
    activeClients: number;
    invoicesThisMonth: number;
    limits: { seats: number; clients: number | null; invoicesPerMonth: number | null };
  };
};

export function useDashboard(slug: string) {
  return useQuery({
    queryKey: ['org', slug, 'dashboard'],
    queryFn: () => api<Dashboard>(`/orgs/${slug}/dashboard`),
  });
}
