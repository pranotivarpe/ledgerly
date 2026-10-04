import { createBrowserRouter } from 'react-router';
import { AppIndexRedirect, GuestOnly, RequireAuth } from '@/components/route-guards';
import { AppLayout } from '@/layouts/app-layout';
import { BillingPage } from '@/pages/app/billing';
import { ClientDetailPage } from '@/pages/app/client-detail';
import { ClientsPage } from '@/pages/app/clients';
import { CreateOrgPage } from '@/pages/app/create-org';
import { DashboardPage } from '@/pages/app/dashboard';
import { InvoiceDetailPage } from '@/pages/app/invoice-detail';
import { InvoiceEditorPage } from '@/pages/app/invoice-editor';
import { InvoicesPage } from '@/pages/app/invoices';
import { ProjectsPage } from '@/pages/app/projects';
import { SettingsPage } from '@/pages/app/settings';
import { TeamPage } from '@/pages/app/team';
import { LoginPage } from '@/pages/auth/login';
import { SignupPage } from '@/pages/auth/signup';
import { LandingPage } from '@/pages/marketing/landing';
import { InvitePage } from '@/pages/invite';
import { NotFoundPage } from '@/pages/not-found';

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/invite/:token', element: <InvitePage /> },
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
      { path: 'new', element: <CreateOrgPage /> },
      {
        path: ':orgSlug',
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'clients', element: <ClientsPage /> },
          { path: 'clients/:clientId', element: <ClientDetailPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'invoices', element: <InvoicesPage /> },
          { path: 'invoices/new', element: <InvoiceEditorPage /> },
          { path: 'invoices/:invoiceId', element: <InvoiceDetailPage /> },
          { path: 'invoices/:invoiceId/edit', element: <InvoiceEditorPage /> },
          { path: 'team', element: <TeamPage /> },
          { path: 'billing', element: <BillingPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
