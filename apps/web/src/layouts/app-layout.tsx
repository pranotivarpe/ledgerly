import {
  ChevronsUpDown,
  CreditCard,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Settings,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      {/* Mobile overlay */}
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
          <OrgSwitcher />
        </div>
        <nav className="mt-6 flex-1 space-y-6 overflow-y-auto px-3">
          <NavGroup items={MAIN_NAV} />
          <NavGroup label="Workspace" items={WORKSPACE_NAV} />
        </nav>
        <div className="border-t p-3">
          <UserCard />
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
  );
}

function NavGroup({ label, items }: { label?: string; items: NavItem[] }) {
  const { orgSlug } = useParams();
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
              to={`/app/${orgSlug}/${item.to}`}
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

// Placeholder until organizations are loaded from the API (Phase 2).
function OrgSwitcher() {
  return (
    <button className="flex w-full items-center gap-3 rounded-lg border bg-card p-2 text-left shadow-xs hover:bg-muted">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
        N
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">Northwind Studio</span>
        <span className="block text-xs text-muted-foreground">Free plan</span>
      </span>
      <ChevronsUpDown className="size-4 text-muted-foreground" />
    </button>
  );
}

function UserCard() {
  return (
    <div className="flex items-center gap-3 rounded-md p-2">
      <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        AM
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">Alex Morgan</span>
        <span className="block truncate text-xs text-muted-foreground">Owner</span>
      </span>
    </div>
  );
}
