import { AlertCircle, CircleDollarSign, Clock, FileText, Plus } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';

const STATS = [
  { label: 'Collected this month', value: 0, icon: CircleDollarSign },
  { label: 'Outstanding', value: 0, icon: Clock },
  { label: 'Overdue', value: 0, icon: AlertCircle },
];

export function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="An overview of your agency's billing."
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
                <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(s.value)}</p>
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
