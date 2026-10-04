import { ChevronLeft, ChevronRight, FileText, Plus } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { InvoiceStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInvoices, type InvoiceStatus } from '@/lib/invoices';
import { useCan, useCurrentOrg } from '@/lib/org-context';
import { cn, formatDate, formatMoney } from '@/lib/utils';

const TABS: { label: string; value?: InvoiceStatus }[] = [
  { label: 'All' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Void', value: 'VOID' },
];

export function InvoicesPage() {
  const org = useCurrentOrg();
  const navigate = useNavigate();
  const canWrite = useCan('invoices:write');
  // Filters live in the URL so they survive reloads and can be shared.
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as InvoiceStatus | null) ?? undefined;
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);

  const update = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    setParams(merged, { replace: true });
  };

  const invoices = useInvoices(org.slug, { status, q: q || undefined, page });
  const data = invoices.data;
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const isEmpty = data && total === 0 && !q;

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Create, send and track every invoice."
        actions={
          canWrite && (
            <Button asChild>
              <Link to={`/app/${org.slug}/invoices/new`}>
                <Plus /> New invoice
              </Link>
            </Button>
          )
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Create your first invoice, then send it to your client as a PDF."
          action={
            canWrite && (
              <Button asChild>
                <Link to={`/app/${org.slug}/invoices/new`}>
                  <Plus /> New invoice
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
              {TABS.map((tab) => {
                const count = tab.value ? data?.counts[tab.value] : total;
                return (
                  <button
                    key={tab.label}
                    onClick={() => update({ status: tab.value, page: undefined })}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                      status === tab.value
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {tab.label}
                    {count !== undefined && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 text-xs tabular-nums',
                          tab.value === 'OVERDUE' && count > 0
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-muted',
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <SearchInput
              value={q}
              onChange={(v) => update({ q: v || undefined, page: undefined })}
              placeholder="Search number or client"
              className="lg:w-72"
            />
          </div>

          {invoices.isPending ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : data?.invoices.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No invoices match.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden md:table-cell">Issued</TableHead>
                  <TableHead className="hidden sm:table-cell">Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/app/${org.slug}/invoices/${inv.id}`)}
                  >
                    <TableCell>
                      <p className="font-medium">{inv.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.client.company || inv.client.name}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatDate(inv.issueDate)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'hidden sm:table-cell',
                        inv.status === 'OVERDUE'
                          ? 'font-medium text-destructive'
                          : 'text-muted-foreground',
                      )}
                    >
                      {formatDate(inv.dueDate)}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(inv.totalCents, inv.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {data && data.pagination.pageCount > 1 && (
            <div className="flex items-center justify-between border-t px-6 py-3 text-sm">
              <p className="text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.pageCount} · {data.pagination.total}{' '}
                invoices
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => update({ page: String(page - 1) })}
                >
                  <ChevronLeft /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.pageCount}
                  onClick={() => update({ page: String(page + 1) })}
                >
                  Next <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
