import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { FormError, FormField } from '@/components/form-field';
import { DemoPanel } from '@/components/demo-panel';
import { safeNext } from '@/components/route-guards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useLogin } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { AuthLayout } from './auth-layout';

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

type Values = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      description="Log in to your Ledgerly workspace."
      footer={
        <>
          New to Ledgerly?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <FormError message={errors.root?.message} />
        <FormField id="email" label="Work email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@agency.com"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
        </FormField>
        <FormField id="password" label="Password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending && <Spinner />} Log in
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <DemoPanel highlight={params.get('demo') === '1'} />
    </AuthLayout>
  );
}
