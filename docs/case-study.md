# Case study: Ledgerly, a multi-tenant SaaS MVP with subscription billing

_Portfolio project · React, Node.js/Express, PostgreSQL, Stripe_

## The brief

Agency founders kept asking the same thing: _"Can you build my SaaS MVP?"_ What they really want
to know is whether a developer can handle the three hard parts of any SaaS: **multiple customers
in one app (multi-tenancy), user roles, and recurring billing.** Ledgerly is a complete product
built to answer that: a client portal and invoicing tool for small agencies.

## What I built

- **Team accounts with roles.** Agencies sign up, invite teammates by email, and assign them
  Owner, Admin or Member permissions. Every agency's data is fully isolated from every other's.
- **Subscription billing with Stripe.** Free, Pro and Team plans with real Stripe Checkout,
  upgrades and downgrades charged pro rata, a self-serve billing portal, and plan limits the app
  enforces (seats, clients, invoices per month).
- **Invoicing.** Clients, projects and budgets; an invoice editor with tax and live totals; branded
  PDF invoices emailed automatically.
- **Client portal.** Each agency's clients get a branded portal. They sign in with an email link
  (no passwords), see their invoices and pay by card. Payments mark invoices as paid instantly.
- **Automation.** Receipts, "you got paid" alerts, failed-payment warnings and polite overdue
  reminders, all sent automatically.
- **Dashboard.** Monthly revenue chart, top clients, outstanding and overdue totals, and a team
  activity feed.

## The decisions that matter to a client

| Problem                                                | How it's solved                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| "Could one customer ever see another customer's data?" | Every database query is automatically limited to one organization, and tested  |
| "What if Stripe sends the same event twice, or late?"  | Each event is processed exactly once and always re-checked against Stripe      |
| "Will a customer get charged or emailed twice?"        | Payments and reminders are recorded exactly once, even across multiple servers |
| "Are logins secure?"                                   | Short-lived tokens, revocable sessions, hashed passwords, rate-limited login   |
| "Can I show investors a demo without breaking it?"     | One-click demo accounts in a sandbox that resets daily and can't send emails   |
| "Will it work on phones?"                              | Every page is tested at phone width                                            |

## Quality

- **129 automated tests:** 115 API tests and 14 browser tests that click through real flows. One
  of them pays through real Stripe test checkout.
- **Continuous integration:** every change is type-checked, tested and built automatically on
  GitHub.
- **One-command setup:** seed data and Stripe setup scripts, so another developer can run it in
  minutes.

## Tech

React 19 · TypeScript · Tailwind CSS · Node.js · Express · PostgreSQL · Prisma · Stripe Billing &
Checkout · React Email + Resend · Playwright · GitHub Actions · Render + Neon

## What this means for your project

If you need a SaaS MVP, I can deliver these pieces production-ready rather than as a prototype you
have to rebuild later:

- sign-up and team accounts
- roles and permissions
- Stripe subscriptions
- customer-facing portals
- automated emails
- dashboards

---

**Upwork portfolio blurb** (≈600 characters)

> Ledgerly is a multi-tenant SaaS MVP: a client portal and invoicing tool for agencies. Teams sign
> up, invite members with role-based permissions and subscribe through Stripe (Free/Pro/Team,
> prorated upgrades, self-serve billing portal). Agencies send branded PDF invoices that clients
> pay by card in a passwordless portal. Includes revenue dashboards, automated reminders and
> receipts, strict data isolation between customers, and 129 automated tests.
> Stack: React, TypeScript, Node/Express, PostgreSQL/Prisma, Stripe.
