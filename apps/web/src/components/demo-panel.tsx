import { Building2, Crown, Loader2, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useDemoAvailability, useDemoLogin, usePortalDemoLogin } from '@/lib/demo';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/utils';

const OPTIONS: { role: Role | 'CLIENT'; title: string; body: string; icon: typeof Crown }[] = [
  {
    role: 'OWNER',
    title: 'Agency owner',
    body: 'Full access: billing, team, invoices',
    icon: Crown,
  },
  {
    role: 'MEMBER',
    title: 'Team member',
    body: 'Day-to-day work, limited permissions',
    icon: UserRound,
  },
  {
    role: 'CLIENT',
    title: 'Client portal',
    body: 'What your clients see when they pay',
    icon: Building2,
  },
];

/** One-click demo logins shown on the login page when the public demo is enabled. */
export function DemoPanel({ highlight }: { highlight?: boolean }) {
  const navigate = useNavigate();
  const { data } = useDemoAvailability();
  const login = useDemoLogin();
  const portalSlug = data?.portalSlug ?? 'northwind';
  const portalLogin = usePortalDemoLogin(portalSlug);

  if (!data?.enabled) return null;

  const pending = login.isPending || portalLogin.isPending;
  const activeRole = login.isPending ? login.variables : portalLogin.isPending ? 'CLIENT' : null;

  const choose = (role: Role | 'CLIENT') => {
    const onError = (err: Error) => toast.error(err.message);
    if (role === 'CLIENT') {
      portalLogin.mutate(undefined, {
        onSuccess: () => navigate(`/portal/${portalSlug}/invoices`),
        onError,
      });
    } else {
      login.mutate(role, { onSuccess: (org) => navigate(`/app/${org.slug}`), onError });
    }
  };

  return (
    <section
      aria-labelledby="demo-heading"
      className={cn(
        'rounded-xl border bg-accent/40 p-4 transition-shadow',
        highlight && 'border-primary/40 shadow-[0_0_0_4px] shadow-primary/10',
      )}
    >
      <h2 id="demo-heading" className="text-sm font-semibold">
        Explore the live demo
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        A sample agency with a year of data. No sign-up needed — it resets daily.
      </p>
      <div className="mt-3 grid gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.role}
            type="button"
            disabled={pending}
            onClick={() => choose(o.role)}
            className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/50 disabled:opacity-60"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              {activeRole === o.role ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <o.icon className="size-4" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{o.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{o.body}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
