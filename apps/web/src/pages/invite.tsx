import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormError, FormField } from '@/components/form-field';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FullPageSpinner, Spinner } from '@/components/ui/spinner';
import { useLogout, useMe, useSignup } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import {
  ROLE_INFO,
  useAcceptInvitation,
  usePublicInvitation,
  type PublicInvitation,
} from '@/lib/team';

export function InvitePage() {
  const { token = '' } = useParams();
  const invitation = usePublicInvitation(token);
  const me = useMe();

  if (invitation.isPending || me.isPending) return <FullPageSpinner />;

  if (invitation.isError) {
    return (
      <Shell>
        <StatusMessage
          icon="error"
          title="Invitation not found"
          body="This link is invalid or has been revoked. Ask whoever invited you to send a new one."
        />
      </Shell>
    );
  }

  const inv = invitation.data;

  if (inv.state === 'expired') {
    return (
      <Shell>
        <StatusMessage
          icon="error"
          title="This invitation has expired"
          body={`Ask ${inv.invitedBy} to send you a new invitation to ${inv.organization.name}.`}
        />
      </Shell>
    );
  }

  if (inv.state === 'accepted') {
    return (
      <Shell>
        <StatusMessage
          icon="success"
          title="Invitation already accepted"
          body={`You're already part of ${inv.organization.name}.`}
          action={
            <Button asChild>
              <Link to={me.data ? '/app' : '/login'}>{me.data ? 'Go to Ledgerly' : 'Log in'}</Link>
            </Button>
          }
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <InviteHeader inv={inv} />
      {me.data ? (
        me.data.user.email === inv.email ? (
          <AcceptAsCurrentUser token={token} inv={inv} />
        ) : (
          <WrongAccount signedInAs={me.data.user.email} inv={inv} />
        )
      ) : inv.userExists ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted-foreground">
            You already have a Ledgerly account for{' '}
            <strong className="text-foreground">{inv.email}</strong>.
          </p>
          <Button className="w-full" asChild>
            <Link to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
              Log in to accept
            </Link>
          </Button>
        </div>
      ) : (
        <SignupFromInvite token={token} inv={inv} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>
      <Card className="w-full max-w-md">
        <CardContent className="p-8">{children}</CardContent>
      </Card>
    </div>
  );
}

function InviteHeader({ inv }: { inv: PublicInvitation }) {
  return (
    <div className="mb-6 text-center">
      <span
        className="mx-auto flex size-12 items-center justify-center rounded-xl text-lg font-semibold text-white"
        style={{ backgroundColor: inv.organization.brandColor }}
      >
        {inv.organization.name.charAt(0).toUpperCase()}
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Join {inv.organization.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {inv.invitedBy} invited you to join as {inv.role === 'ADMIN' ? 'an' : 'a'}{' '}
        <strong className="text-foreground">{ROLE_INFO[inv.role].label}</strong>.
      </p>
    </div>
  );
}

function StatusMessage({
  icon,
  title,
  body,
  action,
}: {
  icon: 'success' | 'error';
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const Icon = icon === 'success' ? CircleCheck : CircleAlert;
  return (
    <div className="text-center">
      <Icon
        className={`mx-auto size-10 ${icon === 'success' ? 'text-success' : 'text-muted-foreground'}`}
      />
      <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function AcceptAsCurrentUser({ token, inv }: { token: string; inv: PublicInvitation }) {
  const navigate = useNavigate();
  const accept = useAcceptInvitation(token);

  const onAccept = () =>
    accept.mutate(undefined, {
      onSuccess: (org) => {
        toast.success(`Welcome to ${org.name}!`);
        navigate(`/app/${org.slug}`, { replace: true });
      },
      onError: (err) => toast.error(err.message),
    });

  return (
    <Button className="w-full" onClick={onAccept} disabled={accept.isPending}>
      {accept.isPending && <Spinner />} Join {inv.organization.name}
    </Button>
  );
}

function WrongAccount({ signedInAs, inv }: { signedInAs: string; inv: PublicInvitation }) {
  const logout = useLogout();
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        You're signed in as <strong>{signedInAs}</strong>, but this invitation was sent to{' '}
        <strong>{inv.email}</strong>.
      </div>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
      >
        Log out and continue as {inv.email}
      </Button>
    </div>
  );
}

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  password: z.string().min(8, 'At least 8 characters').max(128),
});

function SignupFromInvite({ token, inv }: { token: string; inv: PublicInvitation }) {
  const navigate = useNavigate();
  const signup = useSignup();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { organizations } = await signup.mutateAsync({
        ...values,
        email: inv.email,
        inviteToken: token,
      });
      toast.success(`Welcome to ${organizations[0]!.name}!`);
      navigate(`/app/${organizations[0]!.slug}`, { replace: true });
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={errors.root?.message} />
      <FormField id="email" label="Email">
        <Input id="email" value={inv.email} readOnly disabled />
      </FormField>
      <FormField id="name" label="Your name" error={errors.name?.message}>
        <Input
          id="name"
          autoComplete="name"
          autoFocus
          aria-invalid={!!errors.name}
          {...register('name')}
        />
      </FormField>
      <FormField id="password" label="Choose a password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...register('password')}
        />
      </FormField>
      <Button type="submit" className="w-full" disabled={signup.isPending}>
        {signup.isPending && <Spinner />} Create account & join
      </Button>
    </form>
  );
}
