import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useCreateClient, useUpdateClient, type Client } from '@/lib/clients';
import { applyServerErrors } from '@/lib/forms';
import { useCurrentOrg } from '@/lib/org-context';
import { toastError } from '@/lib/plan-limit';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.email('Enter a valid email'),
  company: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(500),
  notes: z.string().trim().max(2000),
});

type Values = z.infer<typeof schema>;

const empty: Values = { name: '', email: '', company: '', phone: '', address: '', notes: '' };

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
  onSaved?: (client: Client) => void;
}) {
  const org = useCurrentOrg();
  const navigate = useNavigate();
  const create = useCreateClient(org.slug);
  const update = useUpdateClient(org.slug);
  const pending = create.isPending || update.isPending;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    if (open) {
      reset(
        client
          ? {
              name: client.name,
              email: client.email,
              company: client.company ?? '',
              phone: client.phone ?? '',
              address: client.address ?? '',
              notes: client.notes ?? '',
            }
          : empty,
      );
    }
  }, [open, client, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = client
        ? await update.mutateAsync({ id: client.id, ...values })
        : await create.mutateAsync(values);
      toast.success(client ? 'Client updated' : `${saved.name} added`);
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
        onOpenChange(false);
        toastError(err, () => navigate(`/app/${org.slug}/billing`));
        return;
      }
      applyServerErrors(err, setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{client ? 'Edit client' : 'New client'}</DialogTitle>
          <DialogDescription>Invoices are emailed to the billing email address.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={errors.root?.message} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="client-name" label="Contact name" error={errors.name?.message}>
              <Input
                id="client-name"
                autoFocus
                aria-invalid={!!errors.name}
                {...register('name')}
              />
            </FormField>
            <FormField id="client-company" label="Company" error={errors.company?.message}>
              <Input id="client-company" placeholder="Optional" {...register('company')} />
            </FormField>
            <FormField id="client-email" label="Billing email" error={errors.email?.message}>
              <Input
                id="client-email"
                type="email"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
            </FormField>
            <FormField id="client-phone" label="Phone" error={errors.phone?.message}>
              <Input id="client-phone" placeholder="Optional" {...register('phone')} />
            </FormField>
          </div>
          <FormField id="client-address" label="Address" error={errors.address?.message}>
            <Textarea
              id="client-address"
              rows={2}
              placeholder="Shown on invoices"
              {...register('address')}
            />
          </FormField>
          <FormField id="client-notes" label="Internal notes" error={errors.notes?.message}>
            <Textarea
              id="client-notes"
              rows={2}
              placeholder="Only visible to your team"
              {...register('notes')}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />} {client ? 'Save changes' : 'Add client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
