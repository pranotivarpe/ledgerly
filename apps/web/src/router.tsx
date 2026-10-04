import { createBrowserRouter } from 'react-router';
import { AppIndexRedirect, GuestOnly, RequireAuth } from '@/components/route-guards';
import { LoginPage } from '@/pages/auth/login';
import { SignupPage } from '@/pages/auth/signup';
import { LandingPage } from '@/pages/marketing/landing';
import { NotFoundPage } from '@/pages/not-found';

/**
 * Marketing and auth pages ship in the main bundle (first visit is instant); everything behind a
 * login is code-split per route and fetched on navigation.
 */
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => ({
  lazy: async () => ({ Component: (await load())[name] }),
});

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/invite/:token', ...page(() => import('@/pages/invite'), 'InvitePage') },
  {
    path: '/portal/:orgSlug',
    ...page(() => import('@/pages/portal/portal-layout'), 'PortalLayout'),
    children: [
      { index: true, ...page(() => import('@/pages/portal/login'), 'PortalLoginPage') },
      { path: 'verify', ...page(() => import('@/pages/portal/verify'), 'PortalVerifyPage') },
      { path: 'invoices', ...page(() => import('@/pages/portal/invoices'), 'PortalInvoicesPage') },
      {
        path: 'invoices/:invoiceId',
        ...page(() => import('@/pages/portal/invoice'), 'PortalInvoicePage'),
      },
    ],
  },
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
  {
    path: '/app',
    element: <RequireAuth />,
    children: [
      { index: true, element: <AppIndexRedirect /> },
      { path: 'new', ...page(() => import('@/pages/app/create-org'), 'CreateOrgPage') },
      {
        path: ':orgSlug',
        ...page(() => import('@/layouts/app-layout'), 'AppLayout'),
        children: [
          { index: true, ...page(() => import('@/pages/app/dashboard'), 'DashboardPage') },
          { path: 'clients', ...page(() => import('@/pages/app/clients'), 'ClientsPage') },
          {
            path: 'clients/:clientId',
            ...page(() => import('@/pages/app/client-detail'), 'ClientDetailPage'),
          },
          { path: 'projects', ...page(() => import('@/pages/app/projects'), 'ProjectsPage') },
          { path: 'invoices', ...page(() => import('@/pages/app/invoices'), 'InvoicesPage') },
          {
            path: 'invoices/new',
            ...page(() => import('@/pages/app/invoice-editor'), 'InvoiceEditorPage'),
          },
          {
            path: 'invoices/:invoiceId',
            ...page(() => import('@/pages/app/invoice-detail'), 'InvoiceDetailPage'),
          },
          {
            path: 'invoices/:invoiceId/edit',
            ...page(() => import('@/pages/app/invoice-editor'), 'InvoiceEditorPage'),
          },
          { path: 'team', ...page(() => import('@/pages/app/team'), 'TeamPage') },
          { path: 'billing', ...page(() => import('@/pages/app/billing'), 'BillingPage') },
          { path: 'settings', ...page(() => import('@/pages/app/settings'), 'SettingsPage') },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
