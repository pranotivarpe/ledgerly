# Ledgerly

**Multi-tenant client portal and invoicing SaaS for small agencies.**

Agencies sign up, invite their team, manage clients and projects, and send invoices that clients pay
online through a branded portal. Agencies pay for Ledgerly itself through Stripe subscriptions.

> 🚧 In active development. See the [roadmap](#roadmap) for progress.

## Tech stack

| Layer    | Tech                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn-style UI, TanStack Query, React Router |
| Backend  | Node.js, Express 5, TypeScript, Zod                                                        |
| Database | PostgreSQL, Prisma ORM                                                                     |
| Payments | Stripe Billing (subscriptions + webhooks), Stripe Checkout                                 |
| Email    | Resend + React Email                                                                       |
| Testing  | Vitest, Supertest, Playwright                                                              |
| CI       | GitHub Actions                                                                             |

## Architecture highlights

- **Multi-tenancy:** shared database, shared schema. Every tenant-owned row carries an
  `organizationId`. Route handlers only get a tenant-scoped Prisma client
  ([`forTenant()`](apps/api/src/lib/tenant.ts)) that injects the organization into every query, so
  one agency can never read or modify another's data. This is covered by
  [isolation tests](apps/api/test/tenant-isolation.test.ts).
- **Role-based access:** Owner / Admin / Member roles per organization, checked on the server for
  every request. Client contacts get a separate, read-and-pay-only portal.
- **Authentication:** short-lived JWT access token + rotating, revocable refresh token, both in
  httpOnly cookies. Passwords hashed with scrypt. Origin-checked against CSRF, rate-limited auth
  endpoints, no account enumeration on login.
- **Team & invitations:** single-use, expiring invite links (only a hash is stored). Pending
  invites count toward the plan's seat limit, and an organization can never lose its last owner.
- **Email:** React Email templates sent through Resend. Without an API key, emails are captured in a
  dev outbox at `/api/dev/emails`, so the full invite flow works locally with zero setup.
- **Invoicing:** money is stored as integer cents and totals are always recomputed on the server.
  Invoice numbers come from an atomic per-organization sequence (safe under concurrent requests).
  Sent invoices are immutable (void and duplicate to correct them), and branded PDFs are rendered
  server-side with `@react-pdf/renderer` and attached to the invoice email.
- **Client portal:** each agency gets a branded portal at `/portal/:slug`. Clients sign in with
  single-use magic links (no passwords). Links are consumed by a POST from the page, never by the
  GET, so corporate email scanners can't burn them. Portal sessions use a separate cookie and JWT
  audience, so agency and client sessions can never be swapped. Clients only see their own,
  non-draft invoices, and access is revoked the moment a client is archived. Invoice emails include a
  "View & pay" link that signs the client straight into that invoice.
- **Invoice payments:** clients pay through Stripe Checkout. Payments are recorded from both the
  webhook and the return-from-Checkout confirmation, made exactly-once by the unique payment-intent
  ID. The confirmation verifies the session belongs to that invoice.
  _Upgrade path:_ payments currently settle to the platform's Stripe account; in production each
  agency would connect its own account with **Stripe Connect** (`transfer_data.destination`), which
  this design supports without changing the invoice flow.
- **Background jobs:** an hourly overdue-reminder job (Pro/Team feature) emails clients the PDF
  and a pay link, at most every 3 days and only within 60 days of the due date. Each invoice is
  _claimed_ with a conditional update before sending, so running the job on several servers at once
  can never double-send. It runs in-process on a single server, or through an authenticated
  `POST /api/jobs/overdue-reminders` cron endpoint for serverless or multi-instance hosting.
- **Transactional email:** welcome, team invite, invoice + PDF, client portal sign-in, payment
  receipt (client), "you got paid" (owners/admins), failed subscription payment (owners), and
  overdue reminders. Notifications never fail the action that triggered them.
- **Analytics:** monthly revenue and top clients via SQL `date_trunc` aggregation (explicitly
  tenant-filtered, since raw SQL bypasses the scoping extension). The chart is hand-built SVG with
  clean axis ticks, hover/keyboard tooltips and a table view for accessibility.
- **Billing:** Stripe Checkout for new subscriptions, in-app plan switching with proration, and the
  Stripe Customer Portal for cards, invoices and cancellation. Webhooks are signature-verified,
  processed exactly once (`StripeEvent` table), and never trust the event payload: they re-fetch
  the latest subscription so out-of-order delivery can't corrupt state. Returning from Checkout also
  triggers a sync, so the UI never waits on webhook latency. Plan limits (seats, clients, invoices
  per month) are enforced by the API, and downgrades that would exceed the new seat limit are blocked.

## Project structure

```
apps/
  api/     Express REST API, Prisma schema and migrations
  web/     React single-page app (marketing site, agency app, client portal)
```

## Getting started

Requirements: Node.js 20+ and PostgreSQL 14+.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # then fill in DATABASE_URL and the JWT secrets
createdb ledgerly && createdb ledgerly_test
npm run db:migrate                          # apply migrations and generate the Prisma client
npm run db:seed                             # optional: demo agency with a year of data
npm run dev                                 # API on :4100, web on :5180
```

| Command             | What it does                     |
| ------------------- | -------------------------------- |
| `npm run dev`       | Run the API and web app together |
| `npm test`          | Run the API test suite           |
| `npm run typecheck` | Type-check both apps             |
| `npm run build`     | Production build of both apps    |

## Roadmap

- [x] **Phase 1:** monorepo scaffold, data model, API foundation, UI shell, CI
- [x] **Phase 2:** authentication, organizations, tenant isolation
- [x] **Phase 3:** team invitations and role-based access
- [x] **Phase 4:** clients, projects, invoices, PDF export
- [x] **Phase 5:** Stripe subscriptions, webhooks, billing page, plan limits
- [x] **Phase 6:** client portal with online invoice payments
- [x] **Phase 7:** revenue dashboard, transactional emails, overdue reminders
- [ ] **Phase 8:** demo data, end-to-end tests, deployment
