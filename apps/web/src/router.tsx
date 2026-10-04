import { createBrowserRouter } from 'react-router';
import { AppIndexRedirect, GuestOnly, RequireAuth } from '@/components/route-guards';
import { AppLayout } from '@/layouts/app-layout';
import { ComingSoonPage } from '@/pages/app/coming-soon';
import { CreateOrgPage } from '@/pages/app/create-org';
import { DashboardPage } from '@/pages/app/dashboard';
import { SettingsPage } from '@/pages/app/settings';
import { LoginPage } from '@/pages/auth/login';
import { SignupPage } from '@/pages/auth/signup';
import { LandingPage } from '@/pages/marketing/landing';
import { NotFoundPage } from '@/pages/not-found';

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
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
          {
            path: 'clients',
            element: <ComingSoonPage title="Clients" description="The companies you work with." />,
          },
          {
            path: 'projects',
            element: (
              <ComingSoonPage title="Projects" description="Work you're delivering for clients." />
            ),
          },
          {
            path: 'invoices',
            element: (
              <ComingSoonPage title="Invoices" description="Create, send and track invoices." />
            ),
          },
          {
            path: 'team',
            element: (
              <ComingSoonPage title="Team" description="Invite teammates and manage roles." />
            ),
          },
          {
            path: 'billing',
            element: (
              <ComingSoonPage title="Billing" description="Your plan, usage and payment details." />
            ),
          },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
