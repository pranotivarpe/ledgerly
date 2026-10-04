import { ChevronRight, FileText } from 'lucide-react';
import { Link } from 'react-router';
import { InvoiceStatusBadge } from '@/components/status-badges';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { usePortalInvoices } from '@/lib/portal';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { PortalAuthed, usePortalOrg } from './portal-layout';

export function PortalInvoicesPage() {
  return (
    <PortalAuthed>
      {(me) => <InvoiceList name={me.contact.name} company={me.client.company} />}
    </PortalAuthed>
  );
}

function InvoiceList({ name, company }: { name: string; company: string | null }) {
  const org = usePortalOrg();
  const { data, isPending } = usePortalInvoices(org.slug);
  const currency = data?.invoices[0]?.currency ?? 'USD';
  const openCount =
    data?.invoices.filter((i) => i.status === 'SENT' || i.status === 'OVERDUE').length ?? 0;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Hi {name.split(' ')[0]} 👋</h1>
      <p className="mt-1 text-muted-foreground">
        Invoices from {org.name}
        {company ? ` for ${company}` : ''}.
      </p>

      {isPending || !data ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      ) : (
        <>
          <Card className="mt-6">
            <CardContent className="flex flex-col gap-1 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding balance</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                  {formatMoney(data.outstandingCents, currency)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {openCount === 0
                  ? "You're all paid up. Thank you!"
                  : `${openCount} invoice${openCount === 1 ? '' : 's'} to pay`}
              </p>
            </CardContent>
          </Card>

          <Card className="mt-6">
            {data.invoices.length === 0 ? (
              <CardContent className="py-16 text-center">
                <FileText className="mx-auto size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No invoices yet.</p>
              </CardContent>
            ) : (
              <ul className="divide-y">
                {data.invoices.map((inv) => {
                  const open = inv.status === 'SENT' || inv.status === 'OVERDUE';
                  return (
                    <li key={inv.id}>
                      <Link
                        to={`/portal/${org.slug}/invoices/${inv.id}`}
                        className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{inv.number}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {inv.project ? `${inv.project.name} · ` : ''}
                            {inv.status === 'PAID' && inv.paidAt
                              ? `Paid ${formatDate(inv.paidAt)}`
                              : `Due ${formatDate(inv.dueDate)}`}
                          </p>
                        </div>
                        <InvoiceStatusBadge status={inv.status} className="hidden sm:inline-flex" />
                        <p
                          className={cn(
                            'w-28 text-right font-medium tabular-nums',
                            !open && 'text-muted-foreground',
                          )}
                        >
                          {formatMoney(inv.totalCents, inv.currency)}
                        </p>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
