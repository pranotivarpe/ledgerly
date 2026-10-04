import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormError, FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateOrg } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { useCan, useCurrentOrg } from '@/lib/org-context';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] as const;

const schema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(80),
  currency: z.enum(CURRENCIES),
  invoicePrefix: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(8)
    .regex(/^[A-Z0-9-]+$/, 'Capital letters, numbers and dashes only'),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #4f46e5'),
  address: z.string().trim().max(500),
});

type Values = z.infer<typeof schema>;

export function SettingsPage() {
  const org = useCurrentOrg();
  const canEdit = useCan('org:update');
  const update = useUpdateOrg(org.slug);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: org.name,
      currency: org.currency as Values['currency'],
      invoicePrefix: org.invoicePrefix,
      brandColor: org.brandColor,
      address: org.address ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const updated = await update.mutateAsync({ ...values, address: values.address || null });
      reset({ ...values, name: updated.name });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(applyServerErrors(err, setError));
    }
  });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your organization's profile and invoice defaults."
      />
      <form onSubmit={onSubmit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>Shown on your invoices and in the client portal.</CardDescription>
          </CardHeader>
          <CardContent>
            {!canEdit && (
              <div className="mb-6 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Lock className="size-4" />{' '}
                {org.isDemo
                  ? 'Settings are read-only in the demo workspace.'
                  : 'Only owners and admins can change these settings.'}
              </div>
            )}
            <FormError message={errors.root?.message} />
            <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField id="name" label="Organization name" error={errors.name?.message}>
                  <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
                </FormField>
              </div>
              <FormField id="currency" label="Default currency" error={errors.currency?.message}>
                <Select id="currency" {...register('currency')}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                id="invoicePrefix"
                label="Invoice number prefix"
                error={errors.invoicePrefix?.message}
                hint={`Invoices will be numbered ${watch('invoicePrefix') || 'INV'}-0001, …`}
              >
                <Input
                  id="invoicePrefix"
                  aria-invalid={!!errors.invoicePrefix}
                  {...register('invoicePrefix')}
                />
              </FormField>
              <FormField id="brandColor" label="Brand colour" error={errors.brandColor?.message}>
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label="Pick brand colour"
                    className="h-9 w-12 cursor-pointer rounded-md border bg-background p-1 disabled:cursor-not-allowed"
                    {...register('brandColor')}
                  />
                  <Input
                    id="brandColor"
                    aria-invalid={!!errors.brandColor}
                    {...register('brandColor')}
                  />
                </div>
              </FormField>
              <div className="sm:col-span-2">
                <FormField id="address" label="Business address" error={errors.address?.message}>
                  <Textarea
                    id="address"
                    rows={3}
                    placeholder={'221B Baker Street\nLondon NW1 6XE'}
                    {...register('address')}
                  />
                </FormField>
              </div>
            </fieldset>
          </CardContent>
          {canEdit && (
            <CardFooter className="justify-end border-t pt-6">
              <Button type="submit" disabled={!isDirty || update.isPending}>
                {update.isPending && <Spinner />} Save changes
              </Button>
            </CardFooter>
          )}
        </Card>
      </form>
    </>
  );
}
