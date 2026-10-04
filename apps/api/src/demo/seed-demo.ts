/**
 * Demo data: "Northwind Studio", a small design agency with a year of billing history.
 *
 *   npm run db:seed -w apps/api      (also re-run daily by the scheduler on the live demo)
 *
 * Idempotent — it deletes and recreates only the demo organization and demo users.
 * Demo logins (password for all: demo-password):
 *   alex@northwind.demo  (Owner)   priya@northwind.demo (Admin)   sam@northwind.demo (Member)
 * Client portal: jordan@acme.demo
 */
import type { InvoiceStatus, PrismaClient } from '../generated/prisma/client.js';
import { computeTotals, lineAmountCents } from '../lib/money.js';
import { hashPassword } from '../lib/password.js';

export const DEMO_SLUG = 'northwind';
export const DEMO_PASSWORD = 'demo-password';
export const DEMO_CLIENT_EMAIL = 'jordan@acme.demo';
export const DEMO_USERS = [
  { email: 'alex@northwind.demo', name: 'Alex Morgan', role: 'OWNER' },
  { email: 'priya@northwind.demo', name: 'Priya Shah', role: 'ADMIN' },
  { email: 'sam@northwind.demo', name: 'Sam Rivera', role: 'MEMBER' },
] as const;

// Deterministic PRNG so the demo looks the same on every seed.
let seed = 42;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
const DAY = 24 * 60 * 60 * 1000;
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const CLIENTS = [
  {
    name: 'Jordan Lee',
    company: 'Acme Robotics',
    email: 'jordan@acme.demo',
    address: '500 Market St\nSan Francisco, CA 94105',
    weight: 5,
  },
  {
    name: 'Maya Chen',
    company: 'Blue Fern Café',
    email: 'maya@bluefern.demo',
    address: '12 Harbour Rd\nSeattle, WA 98101',
    weight: 2,
  },
  {
    name: 'Oliver Grant',
    company: 'Pixel Forge Games',
    email: 'oliver@pixelforge.demo',
    address: '88 Queen St\nToronto, ON M5H 2N2',
    weight: 4,
  },
  {
    name: 'Amara Okafor',
    company: 'Lumen Health',
    email: 'amara@lumen.demo',
    address: '1 Wellness Way\nAustin, TX 78701',
    weight: 4,
  },
  {
    name: 'Lucas Martin',
    company: 'Atlas Logistics',
    email: 'lucas@atlas.demo',
    address: '400 Dock Ave\nRotterdam, NL',
    weight: 3,
  },
  {
    name: 'Sofia Rossi',
    company: 'Verde Interiors',
    email: 'sofia@verde.demo',
    address: 'Via Roma 22\nMilan, IT',
    weight: 2,
  },
  {
    name: 'Noah Kim',
    company: 'Summit Outdoor Co.',
    email: 'noah@summit.demo',
    address: '9 Ridge Rd\nDenver, CO 80202',
    weight: 3,
  },
  { name: 'Grace Hall', company: null, email: 'grace@hallphoto.demo', address: null, weight: 1 },
] as const;

const PROJECTS: [string, string, number | null][] = [
  ['Acme Robotics', 'Website redesign', 1_800_000],
  ['Acme Robotics', 'Product launch campaign', 950_000],
  ['Pixel Forge Games', 'Brand identity refresh', 1_200_000],
  ['Lumen Health', 'Patient portal UX', 2_400_000],
  ['Atlas Logistics', 'Marketing site', 800_000],
  ['Summit Outdoor Co.', 'E-commerce launch', 1_500_000],
];

const LINE_ITEMS = [
  ['UX research & discovery', 1, 180_000, 420_000],
  ['UI design (per screen)', 6, 35_000, 55_000],
  ['Front-end development (hours)', 24, 9_500, 12_000],
  ['Brand strategy workshop', 1, 150_000, 300_000],
  ['Logo & visual identity', 1, 250_000, 600_000],
  ['Copywriting (pages)', 5, 15_000, 30_000],
  ['Monthly retainer', 1, 200_000, 450_000],
  ['Hosting & maintenance', 1, 30_000, 60_000],
  ['Photography (half day)', 1, 80_000, 140_000],
] as const;

export async function seedDemo(prisma: PrismaClient, log: (msg: string) => void = () => {}) {
  seed = 42;

  // Clean up any previous demo data (cascades to everything the org owns).
  await prisma.organization.deleteMany({ where: { slug: DEMO_SLUG } });
  await prisma.user.deleteMany({ where: { email: { in: DEMO_USERS.map((u) => u.email) } } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = await Promise.all(
    DEMO_USERS.map((u) =>
      prisma.user.create({
        data: { email: u.email, name: u.name, passwordHash, emailVerified: new Date() },
      }),
    ),
  );
  const [alex, priya, sam] = users as [(typeof users)[0], (typeof users)[0], (typeof users)[0]];

  const now = new Date();
  const org = await prisma.organization.create({
    data: {
      name: 'Northwind Studio',
      slug: DEMO_SLUG,
      brandColor: '#4f46e5',
      address: '221B Baker Street\nLondon NW1 6XE, UK',
      plan: 'TEAM',
      isDemo: true,
      memberships: {
        create: DEMO_USERS.map((u, i) => ({ userId: users[i]!.id, role: u.role })),
      },
    },
  });

  const clients = await Promise.all(
    CLIENTS.map((c, i) =>
      prisma.client.create({
        data: {
          organizationId: org.id,
          name: c.name,
          company: c.company,
          email: c.email,
          address: c.address,
          phone: i % 2 === 0 ? `+1 555 01${String(i).padStart(2, '0')}` : null,
          createdAt: new Date(now.getTime() - (400 - i * 20) * DAY),
        },
      }),
    ),
  );
  const clientByCompany = new Map(clients.map((c) => [c.company ?? c.name, c]));

  const projects = await Promise.all(
    PROJECTS.map(([company, name, budget], i) =>
      prisma.project.create({
        data: {
          organizationId: org.id,
          clientId: clientByCompany.get(company)!.id,
          name,
          budgetCents: budget,
          status: i === 4 ? 'COMPLETED' : i === 5 ? 'ON_HOLD' : 'ACTIVE',
          dueDate: new Date(now.getTime() + (30 + i * 25) * DAY),
        },
      }),
    ),
  );

  // Weighted client picker, so revenue isn't flat across clients.
  const weighted = clients.flatMap((c, i) => Array.from({ length: CLIENTS[i]!.weight }, () => c));

  type Draft = { issueDate: Date; status: InvoiceStatus };
  const drafts: Draft[] = [];
  for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo--) {
    // A growing agency: more invoices in recent months.
    const count = between(2, 3) + Math.floor((11 - monthsAgo) / 4);
    for (let k = 0; k < count; k++) {
      const issue = utcDay(new Date(now.getFullYear(), now.getMonth() - monthsAgo, between(1, 26)));
      if (issue > now) continue;
      const ageDays = (now.getTime() - issue.getTime()) / DAY;
      let status: InvoiceStatus = 'PAID';
      if (ageDays < 12) status = pick(['SENT', 'SENT', 'DRAFT', 'PAID'] as const);
      else if (ageDays < 45) status = pick(['PAID', 'PAID', 'SENT', 'OVERDUE'] as const);
      drafts.push({ issueDate: issue, status });
    }
  }
  drafts.sort((a, b) => a.issueDate.getTime() - b.issueDate.getTime());
  // A believable mix of open work: two overdue invoices from ~6 weeks ago, two awaiting
  // payment, a draft in progress, and one voided invoice further back.
  const ago = (d: Draft) => (now.getTime() - d.issueDate.getTime()) / DAY;
  drafts
    .filter((d) => ago(d) > 33 && ago(d) < 75)
    .slice(-2)
    .forEach((d) => (d.status = 'OVERDUE'));
  const [draft, ...sent] = [...drafts].reverse();
  if (draft) draft.status = 'DRAFT';
  sent
    .filter((d) => ago(d) <= 28)
    .slice(0, 2)
    .forEach((d) => (d.status = 'SENT'));
  if (drafts[6]) drafts[6].status = 'VOID';

  let number = 1;
  const acmeOpen = { sent: false, overdue: false };
  for (const d of drafts) {
    // The portal demo signs in as Acme, so give Acme something to pay (one open, one overdue).
    const acme = clientByCompany.get('Acme Robotics')!;
    const forAcme =
      (d.status === 'SENT' && !acmeOpen.sent) || (d.status === 'OVERDUE' && !acmeOpen.overdue);
    if (forAcme) acmeOpen[d.status === 'SENT' ? 'sent' : 'overdue'] = true;
    const client = forAcme ? acme : pick(weighted);
    const project = projects.find((p) => p.clientId === client.id && rand() > 0.3) ?? null;
    const items = Array.from({ length: between(1, 3) }, () => {
      const [description, qty, min, max] = pick(LINE_ITEMS);
      const quantity = qty === 1 ? 1 : between(Math.max(1, qty - 3), qty + 6);
      return { description, quantity, unitPriceCents: Math.round(between(min, max) / 500) * 500 };
    });
    const taxRateBps = pick([0, 0, 1000, 2000]);
    const totals = computeTotals(items, taxRateBps);
    const dueDate = new Date(d.issueDate.getTime() + 30 * DAY);
    const status: InvoiceStatus = d.status === 'SENT' && dueDate < now ? 'OVERDUE' : d.status;
    if (status === 'OVERDUE' && dueDate >= now)
      throw new Error('seed: overdue invoice must be past due');
    const paidAt =
      status === 'PAID'
        ? new Date(Math.min(now.getTime() - DAY, d.issueDate.getTime() + between(3, 28) * DAY))
        : null;

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: org.id,
        clientId: client.id,
        projectId: project?.id ?? null,
        number: `INV-${String(number++).padStart(4, '0')}`,
        status,
        currency: 'USD',
        issueDate: d.issueDate,
        dueDate,
        taxRateBps,
        notes: 'Payment due within 30 days. Thank you for your business!',
        ...totals,
        sentAt: status === 'DRAFT' ? null : new Date(d.issueDate.getTime() + 2 * 60 * 60 * 1000),
        paidAt,
        createdAt: d.issueDate,
        items: {
          create: items.map((it, position) => ({
            ...it,
            amountCents: lineAmountCents(it),
            position,
          })),
        },
      },
    });

    if (paidAt) {
      await prisma.payment.create({
        data: {
          organizationId: org.id,
          invoiceId: invoice.id,
          amountCents: totals.totalCents,
          currency: 'USD',
          method: rand() > 0.35 ? 'STRIPE' : 'MANUAL',
          paidAt,
        },
      });
    }
  }
  await prisma.organization.update({ where: { id: org.id }, data: { nextInvoiceNumber: number } });

  // Make sure the current month already has some revenue (the demo is viewed any day of the month).
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const recentPaid = await prisma.invoice.findMany({
    where: { organizationId: org.id, status: 'PAID' },
    orderBy: { issueDate: 'desc' },
    take: 2,
  });
  for (const [i, inv] of recentPaid.entries()) {
    const paidAt = new Date(
      monthStart.getTime() + (now.getTime() - monthStart.getTime()) * (i ? 0.3 : 0.7),
    );
    await prisma.invoice.update({ where: { id: inv.id }, data: { paidAt } });
    await prisma.payment.updateMany({ where: { invoiceId: inv.id }, data: { paidAt } });
  }

  // A little recent activity for the feed.
  const recent = await prisma.invoice.findMany({
    where: { organizationId: org.id },
    orderBy: { issueDate: 'desc' },
    take: 5,
  });
  const activity = [
    {
      actorId: priya.id,
      action: 'member.invited',
      metadata: { email: 'contractor@northwind.demo', role: 'MEMBER' },
      ago: 0.2,
    },
    ...recent.map((inv, i) => ({
      actorId: [alex.id, priya.id, sam.id][i % 3]!,
      action:
        inv.status === 'PAID'
          ? 'invoice.paid'
          : inv.status === 'DRAFT'
            ? 'invoice.created'
            : 'invoice.sent',
      metadata:
        inv.status === 'PAID'
          ? { number: inv.number, method: 'STRIPE', amountCents: inv.totalCents }
          : { number: inv.number, to: 'client' },
      ago: 0.5 + i * 0.7,
    })),
    {
      actorId: alex.id,
      action: 'client.created',
      metadata: { name: 'Summit Outdoor Co.' },
      ago: 5,
    },
  ];
  await prisma.activityLog.createMany({
    data: activity.map((a) => ({
      organizationId: org.id,
      actorId: a.actorId,
      action: a.action,
      metadata: a.metadata,
      createdAt: new Date(now.getTime() - a.ago * DAY),
    })),
  });

  const stats = await prisma.invoice.groupBy({
    by: ['status'],
    where: { organizationId: org.id },
    _count: true,
  });
  log(
    `✔ ${clients.length} clients, ${projects.length} projects, ${number - 1} invoices ` +
      JSON.stringify(Object.fromEntries(stats.map((s) => [s.status, s._count]))),
  );
  log(
    `✔ Demo logins: ${DEMO_USERS.map((u) => `${u.email} (${u.role})`).join(', ')} — password "${DEMO_PASSWORD}"`,
  );
}
