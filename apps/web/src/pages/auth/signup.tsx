import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useSignup } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { AuthLayout } from './auth-layout';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  organizationName: z.string().trim().min(2, 'At least 2 characters').max(80),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters').max(128),
});

type Values = z.infer<typeof schema>;

export function SignupPage() {
  const navigate = useNavigate();
  const signup = useSignup();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { organizations } = await signup.mutateAsync(values);
      navigate(`/app/${organizations[0]!.slug}`, { replace: true });
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <AuthLayout
      title="Create your workspace"
      description="Start on the free plan. Upgrade whenever you're ready."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <FormError message={errors.root?.message} />
        <FormField id="name" label="Your name" error={errors.name?.message}>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Alex Morgan"
            aria-invalid={!!errors.name}
            {...register('name')}
          />
        </FormField>
        <FormField
          id="organizationName"
          label="Agency name"
          error={errors.organizationName?.message}
        >
          <Input
            id="organizationName"
            autoComplete="organization"
            placeholder="Northwind Studio"
            aria-invalid={!!errors.organizationName}
            {...register('organizationName')}
          />
        </FormField>
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
        <FormField
          id="password"
          label="Password"
          error={errors.password?.message}
          hint="At least 8 characters."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        <Button type="submit" className="w-full" disabled={signup.isPending}>
          {signup.isPending && <Spinner />} Create workspace
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By signing up you agree to the Terms and Privacy Policy.
        </p>
      </form>
    </AuthLayout>
  );
}
