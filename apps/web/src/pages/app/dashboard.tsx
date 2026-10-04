import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  Clock,
  FileText,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { ActivityFeed } from '@/components/activity-feed';
import { PageHeader } from '@/components/page-header';
import { RevenueChart, TopClients } from '@/components/revenue-chart';
import { InvoiceStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useMe } from '@/lib/auth';
import { useDashboard, type Dashboard } from '@/lib/dashboard';
import { useCan, useCurrentOrg } from '@/lib/org-context';
import { cn, formatDate, formatMoney } from '@/lib/utils';

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const org = useCurrentOrg();
  const { data: me } = useMe();
  const canInvoice = useCan('invoices:write');
  const { data, isPending } = useDashboard(org.slug);
  const firstName = me?.user.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={`Here's how ${org.name} is doing.`}
        actions={
          canInvoice && (
            <Button asChild>
              <Link to={`/app/${org.slug}/invoices/new`}>
                <Plus /> New invoice
              </Link>
            </Button>
          )
        }
      />

      {isPending || !data ? (
        <div className="flex justify-center py-20">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      ) : (
        <>
          <GettingStarted data={data} />
          <StatCards data={data} />
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <RevenueChart data={data.revenueByMonth} currency={data.currency} />
            <TopClients clients={data.topClients} currency={data.currency} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <RecentInvoices data={data} />
            <div className="space-y-6">
              <PlanUsage data={data} />
              <Card>
                <CardHeader>
                  <CardTitle>Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityFeed items={data.activity} currency={data.currency} />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function StatCards({ data }: { data: Dashboard }) {
  const money = (c: number) => formatMoney(c, data.currency);
  const { stats } = data;
  const delta =
    stats.collectedLastMonthCents > 0
      ? Math.round(
          ((stats.collectedThisMonthCents - stats.collectedLastMonthCents) /
            stats.collectedLastMonthCents) *
            100,
        )
      : null;

  const cards = [
    {
      label: 'Collected this month',
      value: money(stats.collectedThisMonthCents),
      icon: CircleDollarSign,
      sub:
        delta === null ? (
          <span>Nothing collected this time last month</span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-0.5',
              delta >= 0 ? 'text-success' : 'text-destructive',
            )}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {Math.abs(delta)}% vs same time last month
          </span>
        ),
    },
    {
      label: 'Outstanding',
      value: money(stats.outstandingCents),
      icon: Clock,
      sub: `${stats.outstandingCount} open invoice${stats.outstandingCount === 1 ? '' : 's'}`,
    },
    {
      label: 'Overdue',
      value: money(stats.overdueCents),
      icon: AlertCircle,
      danger: stats.overdueCount > 0,
      sub:
        stats.overdueCount > 0
          ? `${stats.overdueCount} need${stats.overdueCount === 1 ? 's' : ''} chasing`
          : 'All caught up',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <div
                className={cn(
                  'flex size-8 items-center justify-center rounded-lg',
                  c.danger
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-accent text-accent-foreground',
                )}
              >
                <c.icon className="size-4" />
              </div>
            </div>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold tracking-tight',
                c.danger && 'text-destructive',
              )}
            >
              {c.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecentInvoices({ data }: { data: Dashboard }) {
  const org = useCurrentOrg();
  const navigate = useNavigate();
  return (
    <Card className="h-fit lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Recent invoices</CardTitle>
          <CardDescription className="mt-1">Your latest invoice activity.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/app/${org.slug}/invoices`}>View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {data.recentInvoices.length === 0 ? (
          <div className="px-6 pb-6 text-center">
            <FileText className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No invoices yet.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {data.recentInvoices.map((inv) => (
              <li
                key={inv.id}
                className="flex cursor-pointer items-center gap-4 px-6 py-3 hover:bg-muted/50"
                onClick={() => navigate(`/app/${org.slug}/invoices/${inv.id}`)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {inv.client.company || inv.client.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inv.number} · due {formatDate(inv.dueDate)}
                  </p>
                </div>
                <InvoiceStatusBadge status={inv.status} />
                <p className="w-24 text-right text-sm font-medium tabular-nums">
                  {formatMoney(inv.totalCents, inv.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PlanUsage({ data }: { data: Dashboard }) {
  const org = useCurrentOrg();
  const canBilling = useCan('billing:manage');
  const { limits, activeClients, invoicesThisMonth } = data.usage;
  if (limits.clients === null && limits.invoicesPerMonth === null) return null;

  const meters = [
    { label: 'Active clients', used: activeClients, limit: limits.clients },
    { label: 'Invoices this month', used: invoicesThisMonth, limit: limits.invoicesPerMonth },
  ].filter((m): m is { label: string; used: number; limit: number } => m.limit !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Free plan usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {meters.map((m) => {
          const pct = Math.min(100, Math.round((m.used / m.limit) * 100));
          return (
            <div key={m.label}>
              <div className="flex justify-between text-sm">
                <span>{m.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {m.used} / {m.limit}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', pct >= 100 ? 'bg-warning' : 'bg-primary')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        {canBilling && (
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link to={`/app/${org.slug}/billing`}>
              <Sparkles /> Upgrade for unlimited
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function GettingStarted({ data }: { data: Dashboard }) {
  const org = useCurrentOrg();
  const steps = [
    { label: 'Add your first client', done: data.usage.activeClients > 0, to: 'clients' },
    { label: 'Create an invoice', done: data.recentInvoices.length > 0, to: 'invoices/new' },
    {
      label: 'Send it to your client',
      done: data.recentInvoices.some((i) => i.status !== 'DRAFT'),
      to: 'invoices',
    },
  ];
  if (steps.every((s) => s.done)) return null;

  return (
    <Card className="mb-6 border-primary/30 bg-accent/40">
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
        <div className="md:w-56">
          <p className="font-semibold">Get set up</p>
          <p className="text-sm text-muted-foreground">Three steps to your first payment.</p>
        </div>
        <ol className="grid flex-1 gap-2 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.label}>
              <Link
                to={`/app/${org.slug}/${s.to}`}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-sm hover:border-primary/40',
                  s.done && 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    s.done ? 'bg-success text-white' : 'bg-primary/10 text-primary',
                  )}
                >
                  {s.done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={cn(s.done && 'line-through')}>{s.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
