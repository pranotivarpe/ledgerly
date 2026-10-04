import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { FormError, FormField } from '@/components/form-field';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useCreateOrg, useMe } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';

const schema = z.object({ name: z.string().trim().min(2, 'At least 2 characters').max(80) });

export function CreateOrgPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const createOrg = useCreateOrg();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const hasOrgs = (me?.organizations.length ?? 0) > 0;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const org = await createOrg.mutateAsync(values);
      navigate(`/app/${org.slug}`);
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4">
      <Logo className="mb-8" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Create an organization</CardTitle>
          <CardDescription>
            Each organization has its own clients, invoices, team and subscription.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormError message={errors.root?.message} />
            <FormField id="name" label="Organization name" error={errors.name?.message}>
              <Input id="name" placeholder="Acme Creative" autoFocus {...register('name')} />
            </FormField>
            <Button type="submit" className="w-full" disabled={createOrg.isPending}>
              {createOrg.isPending && <Spinner />} Create organization
            </Button>
          </form>
        </CardContent>
      </Card>
      {hasOrgs && (
        <Button variant="link" className="mt-4 text-muted-foreground" asChild>
          <Link to="/app">
            <ArrowLeft /> Back to app
          </Link>
        </Button>
      )}
    </div>
  );
}
