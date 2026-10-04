import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { PlanId } from './plans';
import { useInvalidateOrg } from './queries';

export type Billing = {
  plan: PlanId;
  status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasBillingAccount: boolean;
  usage: {
    seats: { used: number; limit: number };
    clients: { used: number; limit: number | null };
    invoicesThisMonth: { used: number; limit: number | null };
  };
};

type BillingResponse = {
  billing: Billing;
  prices: Partial<Record<PlanId, { amount: number; currency: string }>> | null;
};

export function useBilling(slug: string) {
  return useQuery({
    queryKey: ['org', slug, 'billing'],
    queryFn: () => api<BillingResponse>(`/orgs/${slug}/billing`),
  });
}

/** Redirects the browser to a Stripe-hosted page (Checkout or Customer Portal). */
function useStripeRedirect(slug: string, path: 'checkout' | 'portal') {
  return useMutation({
    mutationFn: (body?: { plan: 'PRO' | 'TEAM' }) =>
      api<{ url: string }>(`/orgs/${slug}/billing/${path}`, { method: 'POST', body: body ?? {} }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

export const useCheckout = (slug: string) => useStripeRedirect(slug, 'checkout');
export const usePortal = (slug: string) => useStripeRedirect(slug, 'portal');

export function useChangePlan(slug: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: (plan: 'PRO' | 'TEAM') =>
      api<{ billing: Billing }>(`/orgs/${slug}/billing/change-plan`, {
        method: 'POST',
        body: { plan },
      }),
    onSuccess: invalidate,
  });
}

export function useSyncBilling(slug: string) {
  const invalidate = useInvalidateOrg(slug);
  return useMutation({
    mutationFn: () => api<{ billing: Billing }>(`/orgs/${slug}/billing/sync`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}
