import {
  ArrowLeft,
  CircleCheck,
  Copy,
  Download,
  Mail,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { InvoiceDocument } from '@/components/invoice-document';
import { InvoiceStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FullPageSpinner, Spinner } from '@/components/ui/spinner';
import {
  invoicePdfUrl,
  useDeleteInvoice,
  useInvoice,
  useInvoiceAction,
  type Invoice,
  type InvoiceAction,
} from '@/lib/invoices';
import { useCan, useCurrentOrg } from '@/lib/org-context';
import { toastError } from '@/lib/plan-limit';
import { formatDate, formatMoney, todayInput } from '@/lib/utils';

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const org = useCurrentOrg();
  const navigate = useNavigate();
  const canWrite = useCan('invoices:write');
  const { data: invoice, isPending, isError } = useInvoice(org.slug, invoiceId);
  const action = useInvoiceAction(org.slug);
  const remove = useDeleteInvoice(org.slug);
  const [confirm, setConfirm] = useState<'void' | 'delete' | null>(null);
  const [paidOpen, setPaidOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(todayInput());

  if (isPending) return <FullPageSpinner />;
  if (isError || !invoice) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-xl font-semibold">Invoice not found</h1>
        <Button variant="link" asChild>
          <Link to={`/app/${org.slug}/invoices`}>Back to invoices</Link>
        </Button>
      </div>
    );
  }

  const run = (act: InvoiceAction, success: (inv: Invoice) => string, body?: unknown) =>
    action.mutate(
      { id: invoice.id, action: act, body },
      {
        onSuccess: (inv) => {
          toast.success(success(inv));
          setConfirm(null);
          setPaidOpen(false);
          if (act === 'duplicate') navigate(`/app/${org.slug}/invoices/${inv.id}/edit`);
        },
        onError: (err) => {
          setConfirm(null);
          toastError(err, () => navigate(`/app/${org.slug}/billing`));
        },
      },
    );

  const { status } = invoice;
  const isDraft = status === 'DRAFT';
  const isOpen = status === 'SENT' || status === 'OVERDUE';
  const money = (c: number) => formatMoney(c, invoice.currency);

  return (
    <>
      <Link
        to={`/app/${org.slug}/invoices`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Invoices
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{invoice.number}</h1>
          <InvoiceStatusBadge status={status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && isDraft && (
            <Button variant="outline" asChild>
              <Link to={`/app/${org.slug}/invoices/${invoice.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <a href={invoicePdfUrl(org.slug, invoice.id, true)} download>
              <Download /> PDF
            </a>
          </Button>
          {canWrite && (isDraft || isOpen) && (
            <Button
              onClick={() =>
                run('send', () =>
                  isDraft ? `Invoice sent to ${invoice.client.email}` : 'Reminder sent',
                )
              }
              disabled={action.isPending}
              variant={isDraft ? 'default' : 'outline'}
            >
              {action.isPending && action.variables?.action === 'send' ? (
                <Spinner />
              ) : isDraft ? (
                <Send />
              ) : (
                <Mail />
              )}
              {isDraft ? 'Send invoice' : 'Send reminder'}
            </Button>
          )}
          {canWrite && isOpen && (
            <Button onClick={() => setPaidOpen(true)}>
              <CircleCheck /> Mark as paid
            </Button>
          )}
          {canWrite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => run('duplicate', (inv) => `Duplicated as ${inv.number}`)}
                >
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => window.open(invoicePdfUrl(org.slug, invoice.id), '_blank')}
                >
                  <Download /> Open PDF in new tab
                </DropdownMenuItem>
                {(isOpen || isDraft) && <DropdownMenuSeparator />}
                {isOpen && (
                  <DropdownMenuItem
                    className="text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive"
                    onSelect={() => setConfirm('void')}
                  >
                    <XCircle /> Void invoice
                  </DropdownMenuItem>
                )}
                {isDraft && (
                  <DropdownMenuItem
                    className="text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive"
                    onSelect={() => setConfirm('delete')}
                  >
                    <Trash2 /> Delete draft
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InvoiceDocument invoice={invoice} org={org} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-sm text-muted-foreground">
                  {status === 'PAID' ? 'Amount paid' : 'Amount due'}
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                  {money(invoice.totalCents)}
                </p>
              </div>
              <dl className="space-y-2 text-sm">
                <Row label="Client">
                  <Link
                    to={`/app/${org.slug}/clients/${invoice.client.id}`}
                    className="text-primary hover:underline"
                  >
                    {invoice.client.company || invoice.client.name}
                  </Link>
                </Row>
                {invoice.project && <Row label="Project">{invoice.project.name}</Row>}
                <Row label="Issued">{formatDate(invoice.issueDate)}</Row>
                <Row label="Due">
                  <span className={status === 'OVERDUE' ? 'font-medium text-destructive' : ''}>
                    {formatDate(invoice.dueDate)}
                  </span>
                </Row>
                {invoice.sentAt && <Row label="Sent">{formatDate(invoice.sentAt)}</Row>}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {isDraft
                    ? 'Send this invoice to start collecting payment.'
                    : 'No payments recorded yet.'}
                </p>
              ) : (
                <ul className="space-y-3">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <CircleCheck className="size-4 text-success" />
                      <div className="flex-1">
                        <p className="font-medium tabular-nums">{money(p.amountCents)}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.method === 'STRIPE' ? 'Paid online' : 'Recorded manually'} ·{' '}
                          {formatDate(p.paidAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={paidOpen} onOpenChange={setPaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {invoice.number} as paid</DialogTitle>
            <DialogDescription>
              Record a payment of {money(invoice.totalCents)} received outside Ledgerly (e.g. bank
              transfer).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="paidAt">Payment date</Label>
            <Input
              id="paidAt"
              type="date"
              value={paidAt}
              max={todayInput()}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={action.isPending || !paidAt}
              onClick={() => run('mark-paid', () => `${invoice.number} marked as paid`, { paidAt })}
            >
              {action.isPending && <Spinner />} Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm === 'void'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Void ${invoice.number}?`}
        description="The invoice stays in your records but is no longer payable. You can duplicate it to issue a corrected version."
        confirmLabel="Void invoice"
        destructive
        pending={action.isPending}
        onConfirm={() => run('void', () => `${invoice.number} voided`)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete draft ${invoice.number}?`}
        description="This draft will be permanently deleted."
        confirmLabel="Delete draft"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(invoice.id, {
            onSuccess: () => {
              toast.success('Draft deleted');
              navigate(`/app/${org.slug}/invoices`, { replace: true });
            },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
