import { ArrowLeft, CircleCheck, CreditCard, Download, Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { InvoiceDocument } from '@/components/invoice-document';
import { InvoiceStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { portalPdfUrl, useConfirmPayment, usePayInvoice, usePortalInvoice } from '@/lib/portal';
import { formatDate, formatMoney } from '@/lib/utils';
import { PortalAuthed, usePortalOrg } from './portal-layout';

export function PortalInvoicePage() {
  return <PortalAuthed>{() => <InvoiceView />}</PortalAuthed>;
}

function InvoiceView() {
  const org = usePortalOrg();
  const { invoiceId } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, isPending, isError, refetch } = usePortalInvoice(org.slug, invoiceId);
  const pay = usePayInvoice(org.slug);
  const confirm = useConfirmPayment(org.slug);
  const [justPaid, setJustPaid] = useState(false);
  const handled = useRef(false);

  // Back from Stripe Checkout: confirm the payment straight away instead of waiting for the webhook.
  useEffect(() => {
    const result = params.get('checkout');
    const sessionId = params.get('session_id');
    if (!result || handled.current || !invoiceId) return;
    handled.current = true;
    setParams({}, { replace: true });
    if (result === 'canceled') {
      toast.info('Payment canceled — you have not been charged.');
      return;
    }
    if (sessionId) {
      confirm.mutate(
        { id: invoiceId, sessionId },
        {
          onSuccess: ({ paid }) => {
            if (paid) setJustPaid(true);
            else toast.info('Your payment is processing. This page will update shortly.');
            refetch();
          },
        },
      );
    }
  }, [params, setParams, invoiceId, confirm, refetch]);

  if (isPending || confirm.isPending) {
    return (
      <div className="flex flex-col items-center py-20">
        <Spinner className="size-6 text-muted-foreground" />
        {confirm.isPending && (
          <p className="mt-3 text-sm text-muted-foreground">Confirming your payment…</p>
        )}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-xl font-semibold">Invoice not found</h1>
        <Button variant="link" asChild>
          <Link to={`/portal/${org.slug}/invoices`}>Back to your invoices</Link>
        </Button>
      </div>
    );
  }

  const { invoice } = data;
  const payable = invoice.status === 'SENT' || invoice.status === 'OVERDUE';
  const money = formatMoney(invoice.totalCents, invoice.currency);

  return (
    <>
      <Link
        to={`/portal/${org.slug}/invoices`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All invoices
      </Link>

      {justPaid && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
          <div className="text-sm">
            <p className="font-medium">Payment received — thank you!</p>
            <p className="text-muted-foreground">
              Your payment to {org.name} has been recorded and this invoice is now marked as paid.
            </p>
          </div>
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{invoice.number}</h1>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoice.status === 'PAID' && invoice.paidAt
                ? `${money} paid on ${formatDate(invoice.paidAt)}`
                : `${money} due ${formatDate(invoice.dueDate)}`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" asChild>
              <a href={portalPdfUrl(org.slug, invoice.id, true)} download>
                <Download /> Download PDF
              </a>
            </Button>
            {payable && (
              <Button
                className="text-white"
                style={{ backgroundColor: org.brandColor }}
                disabled={pay.isPending}
                onClick={() => pay.mutate(invoice.id, { onError: (e) => toast.error(e.message) })}
              >
                {pay.isPending ? <Spinner /> : <CreditCard />} Pay {money}
              </Button>
            )}
          </div>
        </CardContent>
        {payable && (
          <p className="flex items-center justify-center gap-1.5 border-t px-6 py-3 text-xs text-muted-foreground">
            <Lock className="size-3" /> Secure card payment via Stripe
          </p>
        )}
      </Card>

      <InvoiceDocument invoice={invoice} org={data.organization} />
    </>
  );
}
