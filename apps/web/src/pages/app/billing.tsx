import { AlertTriangle, Check, CreditCard, ExternalLink, Lock, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  useBilling,
  useChangePlan,
  useCheckout,
  usePortal,
  useSyncBilling,
  type Billing,
} from '@/lib/billing';
import { useCan, useCurrentOrg } from '@/lib/org-context';
import { PLANS, type PlanId } from '@/lib/plans';
import { cn, formatDate } from '@/lib/utils';

const RANK: Record<PlanId, number> = { FREE: 0, PRO: 1, TEAM: 2 };

export function BillingPage() {
  const org = useCurrentOrg();
  const canManage = useCan('billing:manage');
  const { data, isPending } = useBilling(org.slug);
  const checkout = useCheckout(org.slug);
  const portal = usePortal(org.slug);
  const changePlan = useChangePlan(org.slug);
  const sync = useSyncBilling(org.slug);
  const [params, setParams] = useSearchParams();
  const [pendingChange, setPendingChange] = useState<'PRO' | 'TEAM' | null>(null);
  const handledReturn = useRef(false);

  // Returning from Stripe: sync immediately rather than waiting for the webhook.
  useEffect(() => {
    const result = params.get('checkout');
    if (!result || handledReturn.current) return;
    handledReturn.current = true;
    setParams({}, { replace: true });
    if (result === 'canceled') {
      toast.info('Checkout canceled — you have not been charged.');
      return;
    }
    sync.mutate(undefined, {
      onSuccess: ({ billing }) => {
        const name = PLANS.find((p) => p.id === billing.plan)?.name;
        toast.success(
          billing.plan === 'FREE'
            ? 'Payment received — activating your plan…'
            : `You're on ${name}! 🎉`,
        );
      },
    });
  }, [params, setParams, sync]);

  if (isPending || !data) {
    return (
      <>
        <PageHeader title="Billing" description="Your plan, usage and payment details." />
        <div className="flex justify-center py-20">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      </>
    );
  }

  const { billing, prices } = data;
  const busy = checkout.isPending || portal.isPending || changePlan.isPending;

  const choose = (plan: PlanId) => {
    if (plan === billing.plan) return;
    if (plan === 'FREE') {
      // Cancellation happens in the Stripe portal (at period end, with confirmation there).
      portal.mutate(undefined, { onError: (e) => toast.error(e.message) });
    } else if (billing.plan === 'FREE') {
      checkout.mutate({ plan }, { onError: (e) => toast.error(e.message) });
    } else {
      setPendingChange(plan);
    }
  };

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan, usage and payment details."
        actions={
          canManage &&
          billing.hasBillingAccount && (
            <Button variant="outline" onClick={() => portal.mutate()} disabled={busy}>
              {portal.isPending ? <Spinner /> : <CreditCard />} Manage billing{' '}
              <ExternalLink className="size-3.5" />
            </Button>
          )
        }
      />

      {!canManage && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Lock className="size-4" />{' '}
          {org.isDemo
            ? 'Billing is disabled in the demo workspace — sign up to try real Stripe checkout.'
            : 'Only organization owners can change the plan or payment details.'}
        </div>
      )}

      <StatusBanner billing={billing} onFix={() => portal.mutate()} canManage={canManage} />

      <div className="grid gap-6 lg:grid-cols-3">
        <CurrentPlan billing={billing} syncing={sync.isPending} />
        <Usage billing={billing} />
      </div>

      <h2 className="mt-10 mb-4 text-lg font-semibold">Plans</h2>
      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const current = plan.id === billing.plan;
          const price =
            plan.id === 'FREE' ? 0 : (prices?.[plan.id]?.amount ?? plan.price * 100) / 100;
          const upgrade = RANK[plan.id] > RANK[billing.plan];
          const loading =
            (checkout.isPending && checkout.variables?.plan === plan.id) ||
            (changePlan.isPending && changePlan.variables === plan.id);
          return (
            <Card
              key={plan.id}
              className={cn('flex flex-col', current && 'border-primary ring-1 ring-primary')}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  {current && <Badge>Current plan</Badge>}
                </div>
                <CardDescription>{plan.tagline}</CardDescription>
                <p className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">${price}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="flex-1 space-y-2.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className="size-4 shrink-0 translate-y-0.5 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
                {canManage && !current && (
                  <Button
                    className="mt-6"
                    variant={upgrade ? 'default' : 'outline'}
                    disabled={busy}
                    onClick={() => choose(plan.id)}
                  >
                    {loading ? <Spinner /> : upgrade && <Sparkles />}
                    {upgrade ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Payments are processed securely by Stripe. Test mode: use card 4242 4242 4242 4242 with any
        future date and CVC.
      </p>

      <ConfirmDialog
        open={pendingChange !== null}
        onOpenChange={(o) => !o && setPendingChange(null)}
        title={`Switch to ${PLANS.find((p) => p.id === pendingChange)?.name}?`}
        description="The change takes effect immediately. Stripe prorates the difference on your next invoice."
        confirmLabel="Switch plan"
        pending={changePlan.isPending}
        onConfirm={() =>
          pendingChange &&
          changePlan.mutate(pendingChange, {
            onSuccess: ({ billing }) => {
              setPendingChange(null);
              toast.success(`You're now on ${PLANS.find((p) => p.id === billing.plan)?.name}`);
            },
            onError: (e) => {
              setPendingChange(null);
              toast.error(e.message);
            },
          })
        }
      />
    </>
  );
}

function StatusBanner({
  billing,
  onFix,
  canManage,
}: {
  billing: Billing;
  onFix: () => void;
  canManage: boolean;
}) {
  if (billing.status === 'PAST_DUE') {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center">
        <AlertTriangle className="size-5 shrink-0 text-destructive" />
        <div className="flex-1 text-sm">
          <p className="font-medium">Your last payment failed</p>
          <p className="text-muted-foreground">
            Stripe will retry automatically. Update your card to avoid losing paid features.
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant="destructive" onClick={onFix}>
            Update payment method
          </Button>
        )}
      </div>
    );
  }
  if (billing.cancelAtPeriodEnd && billing.currentPeriodEnd) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <AlertTriangle className="size-5 shrink-0 text-[oklch(0.55_0.13_70)]" />
        <p className="flex-1">
          Your subscription is canceled and ends on{' '}
          <strong>{formatDate(billing.currentPeriodEnd)}</strong>. You'll move to the Free plan
          after that.
        </p>
        {canManage && (
          <Button size="sm" variant="outline" onClick={onFix}>
            Renew
          </Button>
        )}
      </div>
    );
  }
  const over = billing.usage.seats.used > billing.usage.seats.limit;
  const clientsOver =
    billing.usage.clients.limit !== null &&
    billing.usage.clients.used > billing.usage.clients.limit;
  if (over || clientsOver) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <AlertTriangle className="size-5 shrink-0 text-[oklch(0.55_0.13_70)]" />
        <p>
          You're over your plan's limits. Existing data is safe, but you can't add more{' '}
          {over ? 'teammates' : 'clients'} until you upgrade or free up space.
        </p>
      </div>
    );
  }
  return null;
}

function CurrentPlan({ billing, syncing }: { billing: Billing; syncing: boolean }) {
  const plan = PLANS.find((p) => p.id === billing.plan)!;
  const statusLabel: Record<
    string,
    { label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' }
  > = {
    ACTIVE: { label: 'Active', variant: 'success' },
    TRIALING: { label: 'Trial', variant: 'success' },
    PAST_DUE: { label: 'Past due', variant: 'danger' },
    INCOMPLETE: { label: 'Incomplete', variant: 'warning' },
    CANCELED: { label: 'Canceled', variant: 'neutral' },
  };
  const status = billing.plan !== 'FREE' && billing.status ? statusLabel[billing.status] : null;

  return (
    <Card>
      <CardHeader>
        <CardDescription>Current plan</CardDescription>
        <div className="flex items-center gap-2">
          <CardTitle className="text-2xl">{plan.name}</CardTitle>
          {status && <Badge variant={status.variant}>{status.label}</Badge>}
          {syncing && <Spinner className="text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {billing.plan === 'FREE' ? (
          <p>Upgrade any time to add teammates and remove client and invoice limits.</p>
        ) : billing.currentPeriodEnd ? (
          <p>
            {billing.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on{' '}
            <span className="font-medium text-foreground">
              {formatDate(billing.currentPeriodEnd)}
            </span>{' '}
            · ${plan.price}
            /month
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Usage({ billing }: { billing: Billing }) {
  const meters = [
    { label: 'Team seats', ...billing.usage.seats, hint: 'Includes pending invitations' },
    { label: 'Active clients', ...billing.usage.clients },
    { label: 'Invoices this month', ...billing.usage.invoicesThisMonth },
  ];
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Usage</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-3">
        {meters.map((m) => {
          const pct = m.limit === null ? 0 : Math.min(100, Math.round((m.used / m.limit) * 100));
          return (
            <div key={m.label}>
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {m.used}
                <span className="text-sm font-normal text-muted-foreground">
                  {' '}
                  / {m.limit === null ? 'Unlimited' : m.limit}
                </span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    m.limit === null
                      ? 'w-full bg-success/40'
                      : pct >= 100
                        ? 'bg-warning'
                        : 'bg-primary',
                  )}
                  style={m.limit === null ? undefined : { width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
