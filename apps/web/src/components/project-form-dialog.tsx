import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useClients } from '@/lib/clients';
import { applyServerErrors } from '@/lib/forms';
import { fromCents, toCents } from '@/lib/money';
import { useCurrentOrg } from '@/lib/org-context';
import { useCreateProject, useUpdateProject, type Project } from '@/lib/projects';
import { toDateInput } from '@/lib/utils';

const schema = z.object({
  clientId: z.string().min(1, 'Choose a client'),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED']),
  budget: z
    .string()
    .trim()
    .refine((v) => v === '' || (!Number.isNaN(toCents(v)) && toCents(v) >= 0), 'Enter an amount'),
  startDate: z.string(),
  dueDate: z.string(),
});

type Values = z.infer<typeof schema>;

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
  defaultClientId?: string;
}) {
  const org = useCurrentOrg();
  const clients = useClients(org.slug);
  const create = useCreateProject(org.slug);
  const update = useUpdateProject(org.slug);
  const pending = create.isPending || update.isPending;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      clientId: project?.clientId ?? defaultClientId ?? '',
      name: project?.name ?? '',
      description: project?.description ?? '',
      status: project?.status ?? 'ACTIVE',
      budget: project?.budgetCents != null ? fromCents(project.budgetCents) : '',
      startDate: project?.startDate ? toDateInput(project.startDate) : '',
      dueDate: project?.dueDate ? toDateInput(project.dueDate) : '',
    });
  }, [open, project, defaultClientId, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const input = {
      clientId: v.clientId,
      name: v.name,
      description: v.description || null,
      status: v.status,
      budgetCents: v.budget ? toCents(v.budget) : null,
      startDate: v.startDate || null,
      dueDate: v.dueDate || null,
    };
    try {
      if (project) await update.mutateAsync({ id: project.id, ...input });
      else await create.mutateAsync(input);
      toast.success(project ? 'Project updated' : `${v.name} created`);
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription>Group invoices by the work you're delivering.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={errors.root?.message} />
          <FormField id="project-name" label="Project name" error={errors.name?.message}>
            <Input id="project-name" autoFocus aria-invalid={!!errors.name} {...register('name')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="project-client" label="Client" error={errors.clientId?.message}>
              <Select
                id="project-client"
                aria-invalid={!!errors.clientId}
                {...register('clientId')}
              >
                <option value="">Select a client…</option>
                {clients.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company || c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="project-status" label="Status">
              <Select id="project-status" {...register('status')}>
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On hold</option>
                <option value="COMPLETED">Completed</option>
              </Select>
            </FormField>
            <FormField
              id="project-budget"
              label={`Budget (${org.currency})`}
              error={errors.budget?.message}
            >
              <Input
                id="project-budget"
                inputMode="decimal"
                placeholder="Optional"
                {...register('budget')}
              />
            </FormField>
            <FormField id="project-due" label="Due date">
              <Input id="project-due" type="date" {...register('dueDate')} />
            </FormField>
          </div>
          <FormField
            id="project-description"
            label="Description"
            error={errors.description?.message}
          >
            <Textarea
              id="project-description"
              rows={3}
              placeholder="Optional"
              {...register('description')}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />} {project ? 'Save changes' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
