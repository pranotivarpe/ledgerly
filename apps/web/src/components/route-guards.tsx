import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '@/components/ui/spinner';
import { useMe } from '@/lib/auth';
import { LAST_ORG_KEY, storage } from '@/lib/storage';

/** Only for signed-in users; everyone else is sent to /login?next=… */
export function RequireAuth() {
  const { data: me, isPending } = useMe();
  const location = useLocation();

  if (isPending) return <FullPageSpinner />;
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/** Login/signup pages: signed-in users skip straight to the app. */
export function GuestOnly() {
  const { data: me, isPending } = useMe();
  if (isPending) return <FullPageSpinner />;
  if (me) return <Navigate to="/app" replace />;
  return <Outlet />;
}

/** /app → the last organization the user worked in, or their first one. */
export function AppIndexRedirect() {
  const { data: me } = useMe();
  const orgs = me?.organizations ?? [];
  if (orgs.length === 0) return <Navigate to="/app/new" replace />;

  const last = storage.get(LAST_ORG_KEY);
  const target = orgs.find((o) => o.slug === last) ?? orgs[0]!;
  return <Navigate to={`/app/${target.slug}`} replace />;
}

/** Only allow same-site relative redirects after login (prevents open redirects). */
export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
}
