import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createClient, createInvoice, ORIGIN, resetDb, setPlan, signUp } from './helpers.js';

beforeEach(resetDb);

describe('clients', () => {
  it('creates, lists, searches and updates clients', async () => {
    const { agent, org } = await signUp();
    const acme = await createClient(agent, org.slug);
    await createClient(agent, org.slug, {
      name: 'Blue Fern Café',
      email: 'hi@bluefern.test',
      company: '',
    });

    const all = await agent.get(`/api/orgs/${org.slug}/clients`);
    expect(all.body.clients.map((c: { name: string }) => c.name)).toEqual([
      'Acme Robotics',
      'Blue Fern Café',
    ]);
    expect(all.body.clients[1].company).toBeNull(); // empty strings are normalised to null

    const search = await agent.get(`/api/orgs/${org.slug}/clients?q=fern`);
    expect(search.body.clients).toHaveLength(1);

    const updated = await agent
      .patch(`/api/orgs/${org.slug}/clients/${acme.id}`)
      .set('Origin', ORIGIN)
      .send({ phone: '+1 555 0100' });
    expect(updated.body.client.phone).toBe('+1 555 0100');
  });

  it('enforces the Free plan limit of 3 active clients; archiving frees a slot', async () => {
    const { agent, org } = await signUp();
    const first = await createClient(agent, org.slug, { name: 'One' });
    await createClient(agent, org.slug, { name: 'Two' });
    await createClient(agent, org.slug, { name: 'Three' });

    const fourth = await agent
      .post(`/api/orgs/${org.slug}/clients`)
      .set('Origin', ORIGIN)
      .send({ name: 'Four', email: 'four@x.test' });
    expect(fourth.status).toBe(402);

    await agent
      .patch(`/api/orgs/${org.slug}/clients/${first.id}`)
      .set('Origin', ORIGIN)
      .send({ archived: true });
    expect((await agent.get(`/api/orgs/${org.slug}/clients`)).body.clients).toHaveLength(2);
    expect(
      (await agent.get(`/api/orgs/${org.slug}/clients?archived=true`)).body.clients,
    ).toHaveLength(1);

    await createClient(agent, org.slug, { name: 'Four' });

    // Restoring would exceed the limit again
    const restore = await agent
      .patch(`/api/orgs/${org.slug}/clients/${first.id}`)
      .set('Origin', ORIGIN)
      .send({ archived: false });
    expect(restore.status).toBe(402);

    await setPlan(org.id, 'PRO');
    await createClient(agent, org.slug, { name: 'Five' });
  });

  it("can't delete a client with invoices (archive instead)", async () => {
    const { agent, org } = await signUp();
    const client = await createClient(agent, org.slug);
    await createInvoice(agent, org.slug, client.id);
    const res = await agent
      .delete(`/api/orgs/${org.slug}/clients/${client.id}`)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(409);
  });

  it('client detail includes projects, invoices and balance stats', async () => {
    const { agent, org } = await signUp();
    const client = await createClient(agent, org.slug);
    const inv = await createInvoice(agent, org.slug, client.id);
    await agent
      .post(`/api/orgs/${org.slug}/invoices/${inv.id}/send`)
      .set('Origin', ORIGIN)
      .expect(200);

    const res = await agent.get(`/api/orgs/${org.slug}/clients/${client.id}`);
    expect(res.body.client.invoices).toHaveLength(1);
    expect(res.body.stats.outstandingCents).toBe(inv.totalCents);
  });

  it("can't see or edit another tenant's clients", async () => {
    const a = await signUp();
    const b = await signUp();
    const client = await createClient(a.agent, a.org.slug);

    expect((await b.agent.get(`/api/orgs/${b.org.slug}/clients/${client.id}`)).status).toBe(404);
    const patch = await b.agent
      .patch(`/api/orgs/${b.org.slug}/clients/${client.id}`)
      .set('Origin', ORIGIN)
      .send({ name: 'pwned' });
    expect(patch.status).toBe(404);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).name).toBe(
      'Acme Robotics',
    );
  });
});

describe('projects', () => {
  it('creates projects for a client and reports billed totals', async () => {
    const { agent, org } = await signUp();
    const client = await createClient(agent, org.slug);
    const created = await agent
      .post(`/api/orgs/${org.slug}/projects`)
      .set('Origin', ORIGIN)
      .send({
        clientId: client.id,
        name: 'Website redesign',
        budgetCents: 800_000,
        dueDate: '2026-12-01',
      });
    expect(created.status).toBe(201);

    await createInvoice(agent, org.slug, client.id, { projectId: created.body.project.id });
    const list = await agent.get(`/api/orgs/${org.slug}/projects`);
    expect(list.body.projects[0]).toMatchObject({
      name: 'Website redesign',
      client: { name: 'Acme Robotics' },
      invoiceCount: 1,
      billedCents: 398_750, // invoice total incl. 10% tax
    });
  });

  it("rejects a project for another tenant's client", async () => {
    const a = await signUp();
    const b = await signUp();
    const foreignClient = await createClient(a.agent, a.org.slug);
    const res = await b.agent
      .post(`/api/orgs/${b.org.slug}/projects`)
      .set('Origin', ORIGIN)
      .send({ clientId: foreignClient.id, name: 'Sneaky' });
    expect(res.status).toBe(400);
  });
});
