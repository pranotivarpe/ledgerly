import {
  ArrowRight,
  BarChart3,
  Check,
  CreditCard,
  FileText,
  Mail,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from '@/components/logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PLANS } from '@/lib/plans';
import { cn } from '@/lib/utils';

const FEATURES = [
  {
    icon: FileText,
    title: 'Invoices in minutes',
    body: 'Line items, taxes and auto-numbering. Export a polished PDF or send it straight to your client.',
  },
  {
    icon: CreditCard,
    title: 'Get paid online',
    body: 'Clients pay by card through Stripe. Invoices are marked paid automatically the moment money lands.',
  },
  {
    icon: Users,
    title: 'Built for teams',
    body: 'Invite teammates as Admins or Members. Everyone sees exactly what their role allows — nothing more.',
  },
  {
    icon: ShieldCheck,
    title: 'Branded client portal',
    body: 'Clients sign in with a magic link to view projects, download invoices and pay — under your brand.',
  },
  {
    icon: BarChart3,
    title: 'Revenue at a glance',
    body: 'Track collected revenue, outstanding balances and overdue invoices on one live dashboard.',
  },
  {
    icon: Mail,
    title: 'Automatic reminders',
    body: 'Polite overdue reminders and payment receipts go out by email, so you never have to chase.',
  },
];

const STEPS = [
  { title: 'Create your workspace', body: 'Sign up, name your agency and invite your team.' },
  { title: 'Add clients & projects', body: 'Keep every client, project and invoice in one place.' },
  { title: 'Send & get paid', body: 'Email an invoice; your client pays online in two clicks.' },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <Hero />
      <section id="features" className="border-t bg-muted/40 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Features"
            title="Everything an agency needs to bill clients"
            body="Replace the spreadsheet, the Word template and the 'just checking in on that invoice' emails."
          />
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-6 shadow-xs">
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="Up and running in an afternoon" />
          <ol className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <Pricing />
      <CallToAction />
      <Footer />
    </div>
  );
}

function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <a href="#pricing" className="hover:text-foreground">
            Pricing
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Log in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/signup">Start free</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[480px] max-w-4xl rounded-full bg-primary/15 blur-3xl"
      />
      <div className="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28">
        <Badge className="mb-6">
          <span className="size-1.5 rounded-full bg-primary" /> Stripe-powered payments
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Invoicing and a client portal, <span className="text-primary">built for agencies</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
          Ledgerly keeps your clients, projects and invoices in one workspace — and gives every
          client a branded portal where they can view and pay what they owe.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link to="/signup">
              Start for free <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/login?demo=1">Explore the live demo</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Free plan forever · No credit card required
        </p>
      </div>
      <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <DashboardPreview />
      </div>
    </section>
  );
}

/** Static product screenshot rendered in HTML so it stays crisp and on-brand. */
function DashboardPreview() {
  const bars = [38, 52, 45, 61, 58, 74, 69, 83, 77, 92, 88, 100];
  const rows = [
    { client: 'Northwind Studio', number: 'INV-0042', amount: '$4,800.00', status: 'Paid' },
    { client: 'Acme Robotics', number: 'INV-0041', amount: '$2,150.00', status: 'Sent' },
    { client: 'Blue Fern Café', number: 'INV-0039', amount: '$960.00', status: 'Overdue' },
  ] as const;

  return (
    <div className="rounded-2xl border bg-card p-2 shadow-2xl shadow-primary/10">
      <div className="rounded-xl border bg-background p-4 text-left sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Collected this month', '$18,420', '+12.5%'],
            ['Outstanding', '$6,310', '7 invoices'],
            ['Overdue', '$960', '1 invoice'],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-5">
          <div className="rounded-lg border p-4 lg:col-span-3">
            <p className="text-sm font-medium">Revenue</p>
            <div className="mt-4 flex h-32 items-end gap-1.5">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex-1 rounded-t-sm',
                    i === bars.length - 1 ? 'bg-primary' : 'bg-primary/25',
                  )}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
          <div className="rounded-lg border p-4 lg:col-span-2">
            <p className="text-sm font-medium">Recent invoices</p>
            <ul className="mt-3 divide-y text-sm">
              {rows.map((r) => (
                <li key={r.number} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.client}</p>
                    <p className="text-xs text-muted-foreground">{r.number}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums">{r.amount}</p>
                    <Badge
                      variant={
                        r.status === 'Paid'
                          ? 'success'
                          : r.status === 'Overdue'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="border-t bg-muted/40 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple pricing that grows with you"
          body="Start free. Upgrade when your agency does. Cancel anytime."
        />
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-2xl border bg-card p-8 shadow-xs',
                plan.highlighted && 'border-primary ring-1 ring-primary',
              )}
            >
              {plan.highlighted && (
                <Badge className="absolute -top-3 left-8 bg-primary text-primary-foreground ring-0">
                  Most popular
                </Badge>
              )}
              <h3 className="font-semibold">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">${plan.price}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </p>
              <ul className="mt-8 flex-1 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <Check className="size-4 shrink-0 translate-y-0.5 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button className="mt-8" variant={plan.highlighted ? 'default' : 'outline'} asChild>
                <Link to="/signup">
                  {plan.price === 0 ? 'Get started' : `Start with ${plan.name}`}
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Spend less time chasing invoices
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
            Set up your workspace in under five minutes. Your first three clients are on us.
          </p>
          <Button size="lg" variant="secondary" className="mt-8" asChild>
            <Link to="/signup">
              Create your workspace <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <Logo className="text-foreground" />
        <p>© {new Date().getFullYear()} Ledgerly. A portfolio project.</p>
      </div>
    </footer>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {body && <p className="mt-4 text-muted-foreground">{body}</p>}
    </div>
  );
}
