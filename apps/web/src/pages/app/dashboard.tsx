import { AlertCircle, CircleDollarSign, Clock, FileText, Plus } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/lib/auth';
import { useCurrentOrg } from '@/lib/org-context';
import { formatMoney } from '@/lib/utils';

const STATS = [
  { label: 'Collected this month', value: 0, icon: CircleDollarSign },
  { label: 'Outstanding', value: 0, icon: Clock },
  { label: 'Overdue', value: 0, icon: AlertCircle },
];

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const org = useCurrentOrg();
  const { data: me } = useMe();
  const firstName = me?.user.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        description={`Here's how ${org.name} is doing.`}
        actions={
          <Button>
            <Plus /> New invoice
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatMoney(s.value, org.currency)}
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <s.icon className="size-4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent invoices</CardTitle>
          <CardDescription>Your latest invoices will show up here.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create your first invoice and send it to a client — they can pay it online."
            action={
              <Button variant="outline">
                <Plus /> Create invoice
              </Button>
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
