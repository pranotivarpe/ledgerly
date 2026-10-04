import { LogOut } from 'lucide-react';
import { createContext, useContext } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { LogoMark } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { FullPageSpinner } from '@/components/ui/spinner';
import {
  usePortalInfo,
  usePortalLogout,
  usePortalMe,
  type PortalMe,
  type PortalOrg,
} from '@/lib/portal';

const PortalOrgContext = createContext<PortalOrg | null>(null);

export function usePortalOrg() {
  const org = useContext(PortalOrgContext);
  if (!org) throw new Error('usePortalOrg must be used inside the portal layout');
  return org;
}

export function PortalBrand({ org, size = 'md' }: { org: PortalOrg; size?: 'md' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-tight">
      <span
        className={`flex items-center justify-center rounded-lg font-bold text-white ${size === 'lg' ? 'size-11 text-lg' : 'size-8 text-sm'}`}
        style={{ backgroundColor: org.brandColor }}
      >
        {org.name.charAt(0).toUpperCase()}
      </span>
      <span className={size === 'lg' ? 'text-xl' : ''}>{org.name}</span>
    </span>
  );
}

/** Branded shell for /portal/:orgSlug/* — the agency's identity, not Ledgerly's. */
export function PortalLayout() {
  const { orgSlug = '' } = useParams();
  const info = usePortalInfo(orgSlug);

  if (info.isPending) return <FullPageSpinner />;
  if (info.isError || !info.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-semibold">Portal not found</h1>
        <p className="mt-2 text-muted-foreground">
          Check the link you were sent, or contact your agency.
        </p>
      </div>
    );
  }

  return (
    <PortalOrgContext.Provider value={info.data}>
      <div className="flex min-h-screen flex-col bg-muted/40">
        <Outlet />
        <footer className="mt-auto flex items-center justify-center gap-1.5 py-6 text-xs text-muted-foreground">
          Secure client portal powered by <LogoMark className="size-4" /> Ledgerly
        </footer>
      </div>
    </PortalOrgContext.Provider>
  );
}

/** Pages that need a signed-in client; sends everyone else to the portal login. */
export function PortalAuthed({ children }: { children: (me: PortalMe) => React.ReactNode }) {
  const org = usePortalOrg();
  const me = usePortalMe(org.slug);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = usePortalLogout(org.slug);

  if (me.isPending) return <FullPageSpinner />;
  if (!me.data) {
    return (
      <Navigate to={`/portal/${org.slug}?next=${encodeURIComponent(location.pathname)}`} replace />
    );
  }

  return (
    <>
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to={`/portal/${org.slug}/invoices`}>
            <PortalBrand org={org} />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {me.data.contact.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                logout.mutate(undefined, { onSettled: () => navigate(`/portal/${org.slug}`) })
              }
            >
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">{children(me.data)}</main>
    </>
  );
}
