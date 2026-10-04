import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, GripVertical, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { ClientFormDialog } from '@/components/client-form-dialog';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FullPageSpinner, Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useClients } from '@/lib/clients';
import { applyServerErrors } from '@/lib/forms';
import { useInvoice, useInvoiceAction, useSaveInvoice, type Invoice } from '@/lib/invoices';
import { computeTotals, fromCents, lineAmountCents, toCents } from '@/lib/money';
import { useCurrentOrg } from '@/lib/org-context';
import { toastError } from '@/lib/plan-limit';
import { useProjects } from '@/lib/projects';
import { formatMoney, toDateInput, todayInput } from '@/lib/utils';

const num = (msg: string) =>
  z
    .string()
    .trim()
    .refine((v) => v !== '' && Number.isFinite(Number(v.replace(/,/g, ''))), msg);

const schema = z
  .object({
    clientId: z.string().min(1, 'Choose a client'),
    projectId: z.string(),
    issueDate: z.string().min(1, 'Required'),
    dueDate: z.string().min(1, 'Required'),
    taxRate: z
      .string()
      .trim()
      .refine((v) => v === '' || (Number(v) >= 0 && Number(v) <= 100), '0–100'),
    notes: z.string().max(2000),
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1, 'Required').max(500),
          quantity: num('Enter a number').refine((v) => Number(v) > 0, 'Must be > 0'),
          unitPrice: num('Enter a price').refine((v) => toCents(v) >= 0, 'Must be ≥ 0'),
        }),
      )
      .min(1, 'Add at least one line item'),
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    path: ['dueDate'],
    message: 'Must be on or after the issue date',
  });

type Values = z.infer<typeof schema>;

const blankItem = { description: '', quantity: '1', unitPrice: '' };

function toValues(inv: Invoice): Values {
  return {
    clientId: inv.client.id,
    projectId: inv.project?.id ?? '',
    issueDate: toDateInput(inv.issueDate),
    dueDate: toDateInput(inv.dueDate),
    taxRate: inv.taxRateBps ? String(inv.taxRateBps / 100) : '',
    notes: inv.notes ?? '',
    items: inv.items.map((i) => ({
      description: i.description,
      quantity: String(i.quantity),
      unitPrice: fromCents(i.unitPriceCents),
    })),
  };
}

/** /invoices/new and /invoices/:invoiceId/edit */
export function InvoiceEditorPage() {
  const { invoiceId } = useParams();
  const org = useCurrentOrg();
  const existing = useInvoice(org.slug, invoiceId);

  if (invoiceId && existing.isPending) return <FullPageSpinner />;
  if (invoiceId && existing.data && existing.data.status !== 'DRAFT') {
    return (
      <div className="py-20 text-center">
        <h1 className="text-xl font-semibold">This invoice can't be edited</h1>
        <p className="mt-2 text-muted-foreground">
          Only drafts can be edited. Void and duplicate it instead.
        </p>
        <Button variant="link" asChild>
          <Link to={`/app/${org.slug}/invoices/${invoiceId}`}>Back to invoice</Link>
        </Button>
      </div>
    );
  }
  return <InvoiceForm invoice={existing.data} />;
}

function InvoiceForm({ invoice }: { invoice?: Invoice }) {
  const org = useCurrentOrg();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clients = useClients(org.slug);
  const save = useSaveInvoice(org.slug, invoice?.id);
  const action = useInvoiceAction(org.slug);
  const [clientDialog, setClientDialog] = useState(false);
  const [intent, setIntent] = useState<'draft' | 'send'>('draft');

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: invoice
      ? toValues(invoice)
      : {
          clientId: params.get('clientId') ?? '',
          projectId: '',
          issueDate: todayInput(),
          dueDate: todayInput(30),
          taxRate: '',
          notes: '',
          items: [blankItem],
        },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const clientId = useWatch({ control, name: 'clientId' });
  const items = useWatch({ control, name: 'items' });
  const taxRate = useWatch({ control, name: 'taxRate' });
  const projects = useProjects(org.slug, { clientId }, { enabled: Boolean(clientId) });

  // Projects belong to one client, so clear the project whenever the client changes.
  const previousClient = useRef(clientId);
  useEffect(() => {
    if (previousClient.current !== clientId) setValue('projectId', '');
    previousClient.current = clientId;
  }, [clientId, setValue]);

  const lines = useMemo(
    () =>
      items.map((i) => {
        const quantity = Number(String(i.quantity).replace(/,/g, '')) || 0;
        const unitPriceCents = toCents(i.unitPrice) || 0;
        return { quantity, unitPriceCents };
      }),
    [items],
  );
  const taxRateBps = Math.round((Number(taxRate) || 0) * 100);
  const totals = computeTotals(lines, taxRateBps);
  const money = (c: number) => formatMoney(c, org.currency);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const saved = await save.mutateAsync({
        clientId: v.clientId,
        projectId: v.projectId || null,
        issueDate: v.issueDate,
        dueDate: v.dueDate,
        taxRateBps,
        notes: v.notes.trim() || null,
        items: v.items.map((i) => ({
          description: i.description,
          quantity: Number(i.quantity.replace(/,/g, '')),
          unitPriceCents: toCents(i.unitPrice),
        })),
      });
      if (intent === 'send') {
        await action.mutateAsync({ id: saved.id, action: 'send' });
        toast.success(`${saved.number} sent to ${saved.client.email}`);
      } else {
        toast.success(invoice ? 'Draft saved' : `${saved.number} created`);
      }
      navigate(`/app/${org.slug}/invoices/${saved.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
        toastError(err, () => navigate(`/app/${org.slug}/billing`));
        return;
      }
      toast.error(applyServerErrors(err, setError));
    }
  });

  const pending = isSubmitting || save.isPending || action.isPending;
  const activeClients = clients.data ?? [];

  return (
    <form onSubmit={onSubmit} noValidate>
      <Link
        to={invoice ? `/app/${org.slug}/invoices/${invoice.id}` : `/app/${org.slug}/invoices`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {invoice ? invoice.number : 'Invoices'}
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {invoice ? `Edit ${invoice.number}` : 'New invoice'}
        </h1>
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="outline"
            disabled={pending}
            onClick={() => setIntent('draft')}
          >
            {pending && intent === 'draft' && <Spinner />} Save draft
          </Button>
          <Button type="submit" disabled={pending} onClick={() => setIntent('send')}>
            {pending && intent === 'send' ? <Spinner /> : <Send />} Save & send
          </Button>
        </div>
      </div>

      <FormError message={errors.root?.message} />

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="clientId"
                label="Client"
                error={errors.clientId?.message}
                action={
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setClientDialog(true)}
                  >
                    + New client
                  </button>
                }
              >
                <Select id="clientId" aria-invalid={!!errors.clientId} {...register('clientId')}>
                  <option value="">Select a client…</option>
                  {activeClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company ? `${c.company} (${c.name})` : c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="projectId" label="Project" error={errors.projectId?.message}>
                <Select
                  id="projectId"
                  disabled={!clientId || !projects.data?.length}
                  {...register('projectId')}
                >
                  <option value="">
                    {clientId && projects.data?.length === 0
                      ? 'No projects for this client'
                      : 'No project'}
                  </option>
                  {projects.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="issueDate" label="Issue date" error={errors.issueDate?.message}>
                <Input id="issueDate" type="date" {...register('issueDate')} />
              </FormField>
              <FormField id="dueDate" label="Due date" error={errors.dueDate?.message}>
                <Input
                  id="dueDate"
                  type="date"
                  aria-invalid={!!errors.dueDate}
                  {...register('dueDate')}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="hidden grid-cols-[1fr_80px_120px_110px_36px] gap-3 pb-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              <ul className="space-y-3">
                {fields.map((field, index) => {
                  const err = errors.items?.[index];
                  return (
                    <li
                      key={field.id}
                      className="grid grid-cols-[1fr_1fr_36px] gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_80px_120px_110px_36px] sm:items-start sm:border-0 sm:p-0"
                    >
                      <div className="col-span-3 sm:col-span-1">
                        <div className="flex items-center gap-1">
                          <GripVertical className="hidden size-4 shrink-0 text-muted-foreground/40 sm:block" />
                          <Input
                            aria-label={`Item ${index + 1} description`}
                            placeholder="e.g. Website design"
                            aria-invalid={!!err?.description}
                            {...register(`items.${index}.description`)}
                          />
                        </div>
                        {err?.description && (
                          <p className="mt-1 text-xs text-destructive">{err.description.message}</p>
                        )}
                      </div>
                      <div>
                        <span className="mb-1 block text-xs text-muted-foreground sm:hidden">
                          Qty
                        </span>
                        <Input
                          aria-label={`Item ${index + 1} quantity`}
                          inputMode="decimal"
                          className="text-right"
                          aria-invalid={!!err?.quantity}
                          {...register(`items.${index}.quantity`)}
                        />
                        {err?.quantity && (
                          <p className="mt-1 text-xs text-destructive">{err.quantity.message}</p>
                        )}
                      </div>
                      <div>
                        <span className="mb-1 block text-xs text-muted-foreground sm:hidden">
                          Unit price
                        </span>
                        <Input
                          aria-label={`Item ${index + 1} unit price`}
                          inputMode="decimal"
                          placeholder="0.00"
                          className="text-right"
                          aria-invalid={!!err?.unitPrice}
                          {...register(`items.${index}.unitPrice`)}
                        />
                        {err?.unitPrice && (
                          <p className="mt-1 text-xs text-destructive">{err.unitPrice.message}</p>
                        )}
                      </div>
                      <p className="col-span-2 self-center text-right text-sm font-medium tabular-nums sm:col-span-1 sm:pt-2">
                        <span className="mr-2 text-xs font-normal text-muted-foreground sm:hidden">
                          Amount
                        </span>
                        {money(lineAmountCents(lines[index] ?? { quantity: 0, unitPriceCents: 0 }))}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove item ${index + 1}`}
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {errors.items?.root?.message && (
                <p className="mt-2 text-xs text-destructive">{errors.items.root.message}</p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => append(blankItem)}
              >
                <Plus /> Add line item
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                aria-label="Notes"
                rows={3}
                placeholder="Payment terms, bank details or a thank-you note — shown on the invoice."
                {...register('notes')}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:sticky lg:top-6 lg:h-fit">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{money(totals.subtotalCents)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="taxRate" className="text-muted-foreground">
                  Tax rate
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="taxRate"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-8 w-20 text-right"
                    aria-invalid={!!errors.taxRate}
                    {...register('taxRate')}
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">{money(totals.taxCents)}</span>
              </div>
              <div className="flex justify-between border-t pt-3 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(totals.totalCents)}</span>
              </div>
              <p className="pt-2 text-xs text-muted-foreground">
                Totals are recalculated on the server when you save, so what you see is exactly what
                your client gets.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ClientFormDialog
        open={clientDialog}
        onOpenChange={setClientDialog}
        onSaved={(c) => setValue('clientId', c.id, { shouldValidate: true })}
      />
    </form>
  );
}
