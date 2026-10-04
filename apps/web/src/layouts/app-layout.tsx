import {
  Check,
  ChevronsUpDown,
  CreditCard,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FullPageSpinner } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api';
import { useLogout, useMe, useOrg } from '@/lib/auth';
import { OrgContext } from '@/lib/org-context';
import { PLANS } from '@/lib/plans';
import { LAST_ORG_KEY, storage } from '@/lib/storage';
import type { OrgSummary, Role } from '@/lib/types';
import { cn, initials } from '@/lib/utils';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

const MAIN_NAV: NavItem[] = [
  { to: '', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: 'clients', label: 'Clients', icon: UsersRound },
  { to: 'projects', label: 'Projects', icon: FolderKanban },
  { to: 'invoices', label: 'Invoices', icon: FileText },
];

const WORKSPACE_NAV: NavItem[] = [
  { to: 'team', label: 'Team', icon: Users },
  { to: 'billing', label: 'Billing', icon: CreditCard },
  { to: 'settings', label: 'Settings', icon: Settings },
];

const ROLE_LABEL: Record<Role, string> = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' };

export function AppLayout() {
  const { orgSlug } = useParams();
  const { data: org, error, isPending } = useOrg(orgSlug);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    if (org) storage.set(LAST_ORG_KEY, org.slug);
  }, [org]);

  if (isPending) return <FullPageSpinner />;
  if (error || !org)
    return <OrgUnavailable notFound={error instanceof ApiError && error.status === 404} />;

  return (
    <OrgContext.Provider value={org}>
      <div className="min-h-screen bg-background lg:pl-64">
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar transition-transform lg:translate-x-0',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-16 items-center justify-between px-5">
            <Logo />
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X />
            </Button>
          </div>
          <div className="px-3">
            <OrgSwitcher current={org} />
          </div>
          <nav className="mt-6 flex-1 space-y-6 overflow-y-auto px-3">
            <NavGroup slug={org.slug} items={MAIN_NAV} />
            <NavGroup slug={org.slug} label="Workspace" items={WORKSPACE_NAV} />
          </nav>
          <div className="border-t p-3">
            <UserMenu role={org.role} />
          </div>
        </aside>

        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </Button>
          <Logo />
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </OrgContext.Provider>
  );
}

function NavGroup({ slug, label, items }: { slug: string; label?: string; items: NavItem[] }) {
  return (
    <div>
      {label && (
        <p className="mb-2 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.label}>
            <NavLink
              to={`/app/${slug}/${item.to}`}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrgAvatar({
  org,
  className,
}: {
  org: Pick<OrgSummary, 'name' | 'brandColor'>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white',
        className,
      )}
      style={{ backgroundColor: org.brandColor }}
    >
      {org.name.charAt(0).toUpperCase()}
    </span>
  );
}

function OrgSwitcher({ current }: { current: OrgSummary }) {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const planName = PLANS.find((p) => p.id === current.plan)?.name ?? current.plan;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-lg border bg-card p-2 text-left shadow-xs outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring">
          <OrgAvatar org={current} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{current.name}</span>
            <span className="block text-xs text-muted-foreground">{planName} plan</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {me?.organizations.map((org) => (
          <DropdownMenuItem key={org.id} onSelect={() => navigate(`/app/${org.slug}`)}>
            <OrgAvatar org={org} className="size-6 rounded text-xs" />
            <span className="flex-1 truncate">{org.name}</span>
            {org.id === current.id && <Check className="text-primary!" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/app/new')}>
          <Plus /> Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ role }: { role: Role }) {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  if (!me) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-md p-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {initials(me.user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{me.user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{ROLE_LABEL[role]}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width)"
      >
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">{me.user.name}</span>
          <span className="block truncate">{me.user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })
          }
        >
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrgUnavailable({ notFound }: { notFound: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        {notFound ? 'Organization not found' : 'Something went wrong'}
      </h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        {notFound
          ? "It doesn't exist, or you're not a member of it."
          : "We couldn't load this organization. Please try again."}
      </p>
      <Button className="mt-8" asChild>
        <Link to="/app">Go to my workspace</Link>
      </Button>
    </div>
  );
}
