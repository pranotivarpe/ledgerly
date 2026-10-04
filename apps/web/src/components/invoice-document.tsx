import { Card, CardContent } from '@/components/ui/card';
import type { Invoice } from '@/lib/invoices';
import { formatDate, formatMoney } from '@/lib/utils';

/** HTML rendering of the invoice document — mirrors the PDF layout. */
export function InvoiceDocument({
  invoice,
  org,
}: {
  invoice: Invoice;
  org: { name: string; address: string | null; brandColor: string };
}) {
  const money = (c: number) => formatMoney(c, invoice.currency);
  const paid = invoice.status === 'PAID';

  return (
    <Card className="relative overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: org.brandColor }} />
      <CardContent className="p-6 sm:p-10">
        {paid && (
          <span className="absolute top-36 right-8 -rotate-6 rounded-md border-2 border-success px-3 py-1 text-lg font-bold tracking-widest text-success">
            PAID
          </span>
        )}
        {invoice.status === 'VOID' && (
          <span className="absolute top-36 right-8 -rotate-6 rounded-md border-2 border-muted-foreground px-3 py-1 text-lg font-bold tracking-widest text-muted-foreground">
            VOID
          </span>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 items-center justify-center rounded-lg text-lg font-bold text-white"
              style={{ backgroundColor: org.brandColor }}
            >
              {org.name.charAt(0).toUpperCase()}
            </span>
            <span className="text-lg font-semibold">{org.name}</span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-wide" style={{ color: org.brandColor }}>
              INVOICE
            </p>
            <p className="text-sm text-muted-foreground">{invoice.number}</p>
          </div>
        </div>

        <div className="mt-10 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              From
            </p>
            <p className="font-semibold">{org.name}</p>
            {org.address && (
              <p className="whitespace-pre-line text-muted-foreground">{org.address}</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Bill to
            </p>
            <p className="font-semibold">{invoice.client.company || invoice.client.name}</p>
            {invoice.client.company && <p>{invoice.client.name}</p>}
            <p className="text-muted-foreground">{invoice.client.email}</p>
            {invoice.client.address && (
              <p className="whitespace-pre-line text-muted-foreground">{invoice.client.address}</p>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 border-y py-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Issue date
            </p>
            <p className="mt-1">{formatDate(invoice.issueDate)}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Due date
            </p>
            <p className="mt-1">{formatDate(invoice.dueDate)}</p>
          </div>
          {invoice.project && (
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Project
              </p>
              <p className="mt-1">{invoice.project.name}</p>
            </div>
          )}
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-foreground text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="pb-2 font-medium">Description</th>
                <th className="hidden pb-2 pl-4 text-right font-medium sm:table-cell">Qty</th>
                <th className="hidden pb-2 pl-4 text-right font-medium sm:table-cell">
                  Unit price
                </th>
                <th className="pb-2 pl-4 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-3">
                    {item.description}
                    <span className="block text-xs text-muted-foreground tabular-nums sm:hidden">
                      {item.quantity} × {money(item.unitPriceCents)}
                    </span>
                  </td>
                  <td className="hidden py-3 pl-4 text-right tabular-nums sm:table-cell">
                    {item.quantity}
                  </td>
                  <td className="hidden py-3 pl-4 text-right tabular-nums sm:table-cell">
                    {money(item.unitPriceCents)}
                  </td>
                  <td className="py-3 pl-4 text-right tabular-nums">{money(item.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 ml-auto w-full max-w-64 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{money(invoice.subtotalCents)}</span>
          </div>
          {invoice.taxRateBps > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax ({invoice.taxRateBps / 100}%)</span>
              <span className="tabular-nums">{money(invoice.taxCents)}</span>
            </div>
          )}
          <div className="flex justify-between border-t-2 border-foreground pt-2 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{money(invoice.totalCents)}</span>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-8 rounded-lg bg-muted p-4 text-sm">
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Notes
            </p>
            <p className="whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
