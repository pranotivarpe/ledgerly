import { beforeEach, describe, expect, it } from 'vitest';
import { clearOutbox, getOutbox } from '../src/lib/email.js';
import { prisma } from '../src/lib/prisma.js';
import {
  createClient,
  createInvoice,
  invoiceBody,
  ORIGIN,
  resetDb,
  setPlan,
  signUp,
} from './helpers.js';

beforeEach(async () => {
  await resetDb();
  clearOutbox();
});

async function setup() {
  const owner = await signUp();
  const client = await createClient(owner.agent, owner.org.slug);
  const base = `/api/orgs/${owner.org.slug}/invoices`;
  return { ...owner, client, base };
}

describe('creating invoices', () => {
  it('computes totals on the server and numbers invoices sequentially per org', async () => {
    const { agent, org, client, base } = await setup();
    const first = await agent
      .post(base)
      .set('Origin', ORIGIN)
      // Client-sent totals are ignored
      .send({ ...invoiceBody(client.id), totalCents: 1 });
    expect(first.status).toBe(201);
    expect(first.body.invoice).toMatchObject({
      number: 'INV-0001',
      status: 'DRAFT',
      currency: 'USD',
      subtotalCents: 362_500, // 2500 + 12.5 × 90
      taxCents: 36_250,
      totalCents: 398_750,
    });
    expect(first.body.invoice.items[1]).toMatchObject({ quantity: 12.5, amountCents: 112_500 });

    const second = await createInvoice(agent, org.slug, client.id);
    expect(second.number).toBe('INV-0002');

    // Another org has its own sequence
    const other = await signUp();
    const otherClient = await createClient(other.agent, other.org.slug);
    expect((await createInvoice(other.agent, other.org.slug, otherClient.id)).number).toBe(
      'INV-0001',
    );
  });

  it('uses the custom prefix and never repeats numbers under concurrency', async () => {
    const { agent, org, client, base } = await setup();
    await setPlan(org.id, 'PRO');
    await agent.patch(`/api/orgs/${org.slug}`).set('Origin', ORIGIN).send({ invoicePrefix: 'NW' });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        agent.post(base).set('Origin', ORIGIN).send(invoiceBody(client.id)),
      ),
    );
    const numbers = results.map((r) => r.body.invoice.number).sort();
    expect(numbers).toEqual(['NW-0001', 'NW-0002', 'NW-0003', 'NW-0004', 'NW-0005']);
  });

  it('validates items, dates and client ownership', async () => {
    const { agent, client, base } = await setup();
    const bad = await agent
      .post(base)
      .set('Origin', ORIGIN)
      .send(invoiceBody(client.id, { items: [], dueDate: '2026-09-01' }));
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details.fieldErrors)).toEqual(
      expect.arrayContaining(['items', 'dueDate']),
    );

    const other = await signUp();
    const foreign = await createClient(other.agent, other.org.slug);
    const res = await agent.post(base).set('Origin', ORIGIN).send(invoiceBody(foreign.id));
    expect(res.status).toBe(400);
  });

  it('enforces the Free plan limit of 5 invoices per month', async () => {
    const { agent, org, client, base } = await setup();
    for (let i = 0; i < 5; i++) await createInvoice(agent, org.slug, client.id);
    const sixth = await agent.post(base).set('Origin', ORIGIN).send(invoiceBody(client.id));
    expect(sixth.status).toBe(402);
    expect(sixth.body.error.message).toMatch(/5 invoices per month/);
  });
});

describe('invoice lifecycle', () => {
  it('drafts can be edited and deleted; sent invoices cannot', async () => {
    const { agent, org, client, base } = await setup();
    const inv = await createInvoice(agent, org.slug, client.id);

    const edited = await agent
      .put(`${base}/${inv.id}`)
      .set('Origin', ORIGIN)
      .send(
        invoiceBody(client.id, {
          taxRateBps: 0,
          items: [{ description: 'Retainer', quantity: 1, unitPriceCents: 50_000 }],
        }),
      );
    expect(edited.status).toBe(200);
    expect(edited.body.invoice).toMatchObject({
      totalCents: 50_000,
      items: [{ description: 'Retainer' }],
    });
    expect(await prisma.invoiceItem.count()).toBe(1);

    await agent.post(`${base}/${inv.id}/send`).set('Origin', ORIGIN).expect(200);
    expect(
      (await agent.put(`${base}/${inv.id}`).set('Origin', ORIGIN).send(invoiceBody(client.id)))
        .status,
    ).toBe(409);
    expect((await agent.delete(`${base}/${inv.id}`).set('Origin', ORIGIN)).status).toBe(409);

    const draft = await createInvoice(agent, org.slug, client.id);
    expect((await agent.delete(`${base}/${draft.id}`).set('Origin', ORIGIN)).status).toBe(204);
  });

  it('sending emails the client with the PDF attached and marks it SENT', async () => {
    const { agent, org, client, base } = await setup();
    const inv = await createInvoice(agent, org.slug, client.id);

    const res = await agent.post(`${base}/${inv.id}/send`).set('Origin', ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body.invoice.status).toBe('SENT');
    expect(res.body.invoice.sentAt).toBeTruthy();

    const [email] = getOutbox();
    expect(email!.to).toBe('billing@acme.test');
    expect(email!.subject).toBe(`Invoice INV-0001 from ${org.name}`);
    expect(email!.text).toContain('$3,987.50');
    expect(email!.attachments).toEqual([{ filename: 'INV-0001.pdf', size: expect.any(Number) }]);

    // Sending again is a reminder
    await agent.post(`${base}/${inv.id}/send`).set('Origin', ORIGIN).expect(200);
    expect(getOutbox()[0]!.subject).toMatch(/^Reminder: /);
  });

  it('a sent invoice past its due date shows as OVERDUE', async () => {
    const { agent, org, client, base } = await setup();
    const inv = await createInvoice(agent, org.slug, client.id, {
      issueDate: '2026-01-01',
      dueDate: '2026-01-15',
    });
    const sent = await agent.post(`${base}/${inv.id}/send`).set('Origin', ORIGIN);
    expect(sent.body.invoice.status).toBe('OVERDUE');

    const list = await agent.get(`${base}?status=OVERDUE`);
    expect(list.body.invoices).toHaveLength(1);
    expect(list.body.counts).toMatchObject({ OVERDUE: 1, DRAFT: 0 });
  });

  it('mark as paid records a manual payment', async () => {
    const { agent, org, client, base } = await setup();
    const inv = await createInvoice(agent, org.slug, client.id);
    expect(
      (await agent.post(`${base}/${inv.id}/mark-paid`).set('Origin', ORIGIN).send({})).status,
    ).toBe(409); // draft

    await agent.post(`${base}/${inv.id}/send`).set('Origin', ORIGIN).expect(200);
    const paid = await agent
      .post(`${base}/${inv.id}/mark-paid`)
      .set('Origin', ORIGIN)
      .send({ paidAt: '2026-10-02' });
    expect(paid.status).toBe(200);
    expect(paid.body.invoice.status).toBe('PAID');
    expect(paid.body.invoice.payments).toEqual([
      expect.objectContaining({ amountCents: inv.totalCents, method: 'MANUAL' }),
    ]);
    expect((await agent.post(`${base}/${inv.id}/void`).set('Origin', ORIGIN)).status).toBe(409);
  });

  it('void and duplicate', async () => {
    const { agent, org, client, base } = await setup();
    const inv = await createInvoice(agent, org.slug, client.id);
    await agent.post(`${base}/${inv.id}/send`).set('Origin', ORIGIN).expect(200);
    const voided = await agent.post(`${base}/${inv.id}/void`).set('Origin', ORIGIN);
    expect(voided.body.invoice.status).toBe('VOID');

    const dup = await agent.post(`${base}/${inv.id}/duplicate`).set('Origin', ORIGIN);
    expect(dup.status).toBe(201);
    expect(dup.body.invoice).toMatchObject({
      number: 'INV-0002',
      status: 'DRAFT',
      totalCents: inv.totalCents,
    });
    expect(dup.body.invoice.items).toHaveLength(2);
  });

  it('renders a real PDF', async () => {
    const { agent, org, client, base } = await setup();
    const inv = await createInvoice(agent, org.slug, client.id);
    const res = await agent
      .get(`${base}/${inv.id}/pdf?download=1`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="INV-0001.pdf"');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('members can manage invoices; another tenant cannot see them', async () => {
    const { agent, org, client, base } = await setup();
    const inv = await createInvoice(agent, org.slug, client.id);

    const member = await signUp();
    await prisma.membership.create({
      data: { userId: member.user.id, organizationId: org.id, role: 'MEMBER' },
    });
    expect((await member.agent.post(`${base}/${inv.id}/send`).set('Origin', ORIGIN)).status).toBe(
      200,
    );

    const outsider = await signUp();
    expect(
      (await outsider.agent.get(`/api/orgs/${outsider.org.slug}/invoices/${inv.id}`)).status,
    ).toBe(404);
    expect(
      (await outsider.agent.get(`/api/orgs/${outsider.org.slug}/invoices/${inv.id}/pdf`)).status,
    ).toBe(404);
    void agent;
  });
});

describe('dashboard', () => {
  it('summarises collected, outstanding and overdue amounts plus activity', async () => {
    const { agent, org, client, base } = await setup();
    const paid = await createInvoice(agent, org.slug, client.id);
    const open = await createInvoice(agent, org.slug, client.id);
    const late = await createInvoice(agent, org.slug, client.id, {
      issueDate: '2026-01-01',
      dueDate: '2026-01-15',
    });
    await createInvoice(agent, org.slug, client.id); // draft

    for (const inv of [paid, open, late])
      await agent.post(`${base}/${inv.id}/send`).set('Origin', ORIGIN).expect(200);
    await agent.post(`${base}/${paid.id}/mark-paid`).set('Origin', ORIGIN).send({}).expect(200);

    const res = await agent.get(`/api/orgs/${org.slug}/dashboard`);
    expect(res.body.stats).toMatchObject({
      collectedThisMonthCents: paid.totalCents,
      outstandingCents: open.totalCents + late.totalCents,
      outstandingCount: 2,
      overdueCents: late.totalCents,
      overdueCount: 1,
      draftCount: 1,
    });
    expect(res.body.activity[0]).toMatchObject({
      action: 'invoice.paid',
      actorName: expect.any(String),
    });
    expect(res.body.usage).toMatchObject({ activeClients: 1, invoicesThisMonth: 4 });
  });
});
