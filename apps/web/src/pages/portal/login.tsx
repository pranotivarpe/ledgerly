import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FullPageSpinner, Spinner } from '@/components/ui/spinner';
import { applyServerErrors } from '@/lib/forms';
import { usePortalDemoLogin } from '@/lib/demo';
import { usePortalMe, useRequestPortalLink } from '@/lib/portal';
import { PortalBrand, usePortalOrg } from './portal-layout';

const schema = z.object({ email: z.email('Enter a valid email') });

export function PortalLoginPage() {
  const org = usePortalOrg();
  const [params] = useSearchParams();
  const me = usePortalMe(org.slug);
  const request = useRequestPortalLink(org.slug);
  const demo = usePortalDemoLogin(org.slug);
  const navigate = useNavigate();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const next = params.get('next') ?? undefined;
  if (me.isPending) return <FullPageSpinner />;
  if (me.data) return <Navigate to={next ?? `/portal/${org.slug}/invoices`} replace />;

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await request.mutateAsync({ email, next });
      setSentTo(email);
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <PortalBrand org={org} size="lg" />
      <Card className="mt-8 w-full max-w-md">
        <CardContent className="p-8">
          {sentTo ? (
            <div className="text-center">
              <MailCheck className="mx-auto size-10 text-success" />
              <h1 className="mt-4 text-xl font-semibold">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                If <strong className="text-foreground">{sentTo}</strong> is registered with{' '}
                {org.name}, we've sent a sign-in link. It expires in 15 minutes.
              </p>
              <Button variant="link" className="mt-4" onClick={() => setSentTo(null)}>
                Use a different email
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Client portal</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                View and pay your invoices from {org.name}. Enter your email and we'll send you a
                secure sign-in link — no password needed.
              </p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
                <FormError message={errors.root?.message} />
                <FormField id="email" label="Email address" error={errors.email?.message}>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="you@company.com"
                    aria-invalid={!!errors.email}
                    {...register('email')}
                  />
                </FormField>
                <Button
                  type="submit"
                  className="w-full text-white"
                  style={{ backgroundColor: org.brandColor }}
                  disabled={request.isPending}
                >
                  {request.isPending && <Spinner />} Email me a sign-in link
                </Button>
              </form>
              {org.isDemo && (
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={demo.isPending}
                  onClick={() =>
                    demo.mutate(undefined, {
                      onSuccess: () => navigate(`/portal/${org.slug}/invoices`),
                    })
                  }
                >
                  {demo.isPending && <Spinner />} Demo: view as a sample client
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
