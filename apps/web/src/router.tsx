import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@/layouts/app-layout';
import { ComingSoonPage } from '@/pages/app/coming-soon';
import { DashboardPage } from '@/pages/app/dashboard';
import { LoginPage } from '@/pages/auth/login';
import { SignupPage } from '@/pages/auth/signup';
import { LandingPage } from '@/pages/marketing/landing';
import { NotFoundPage } from '@/pages/not-found';

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  // Phase 2 replaces this with "redirect to the user's last-used organization".
  { path: '/app', element: <Navigate to="/app/northwind" replace /> },
  {
    path: '/app/:orgSlug',
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
        element: <ComingSoonPage title="Invoices" description="Create, send and track invoices." />,
      },
      {
        path: 'team',
        element: <ComingSoonPage title="Team" description="Invite teammates and manage roles." />,
      },
      {
        path: 'billing',
        element: (
          <ComingSoonPage title="Billing" description="Your plan, usage and payment details." />
        ),
      },
      {
        path: 'settings',
        element: <ComingSoonPage title="Settings" description="Workspace profile and branding." />,
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
