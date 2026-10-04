import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { forTenant } from '../src/lib/tenant.js';
import { ORIGIN, resetDb, signUp } from './helpers.js';

beforeEach(resetDb);

describe('tenant isolation over HTTP', () => {
  it("a user cannot read another organization (404, so slugs can't be probed)", async () => {
    const alice = await signUp();
    const bob = await signUp();

    expect((await alice.agent.get(`/api/orgs/${alice.org.slug}`)).status).toBe(200);
    const res = await bob.agent.get(`/api/orgs/${alice.org.slug}`);
    expect(res.status).toBe(404);
  });

  it('a user cannot update another organization', async () => {
    const alice = await signUp();
    const bob = await signUp();
    const res = await bob.agent
      .patch(`/api/orgs/${alice.org.slug}`)
      .set('Origin', ORIGIN)
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: alice.org.id } });
    expect(org.name).not.toBe('Hijacked');
  });
});

describe('role-based access', () => {
  it('a MEMBER cannot update organization settings', async () => {
    const owner = await signUp();
    const member = await signUp();
    await prisma.membership.create({
      data: { userId: member.user.id, organizationId: owner.org.id, role: 'MEMBER' },
    });

    const read = await member.agent.get(`/api/orgs/${owner.org.slug}`);
    expect(read.status).toBe(200);
    expect(read.body.organization.permissions).not.toContain('org:update');

    const write = await member.agent
      .patch(`/api/orgs/${owner.org.slug}`)
      .set('Origin', ORIGIN)
      .send({ name: 'Renamed by member' });
    expect(write.status).toBe(403);
  });

  it('an OWNER can update organization settings', async () => {
    const owner = await signUp();
    const res = await owner.agent
      .patch(`/api/orgs/${owner.org.slug}`)
      .set('Origin', ORIGIN)
      .send({ name: 'Renamed', currency: 'EUR' });
    expect(res.status).toBe(200);
    expect(res.body.organization).toMatchObject({ name: 'Renamed', currency: 'EUR' });
  });
});

describe('forTenant() data access layer', () => {
  async function twoOrgsWithClients() {
    const a = await signUp();
    const b = await signUp();
    const dbA = forTenant(a.org.id);
    const dbB = forTenant(b.org.id);
    const clientA = await dbA.client.create({
      data: { organizationId: 'ignored', name: 'A Client', email: 'a@client.com' },
    });
    const clientB = await dbB.client.create({
      data: { organizationId: 'ignored', name: 'B Client', email: 'b@client.com' },
    });
    return { a, b, dbA, dbB, clientA, clientB };
  }

  it('stamps organizationId on create, overriding whatever the caller passed', async () => {
    const { a, clientA } = await twoOrgsWithClients();
    expect(clientA.organizationId).toBe(a.org.id);
  });

  it('list and count queries only see the current tenant', async () => {
    const { dbA, clientA } = await twoOrgsWithClients();
    const clients = await dbA.client.findMany();
    expect(clients.map((c) => c.id)).toEqual([clientA.id]);
    expect(await dbA.client.count()).toBe(1);
  });

  it("findUnique by id can't reach another tenant's row", async () => {
    const { dbA, clientB } = await twoOrgsWithClients();
    expect(await dbA.client.findUnique({ where: { id: clientB.id } })).toBeNull();
  });

  it("update and delete can't touch another tenant's row", async () => {
    const { dbA, clientB } = await twoOrgsWithClients();

    await expect(
      dbA.client.update({ where: { id: clientB.id }, data: { name: 'pwned' } }),
    ).rejects.toThrow();
    await expect(dbA.client.delete({ where: { id: clientB.id } })).rejects.toThrow();
    const { count } = await dbA.client.deleteMany({});
    expect(count).toBe(1); // only its own client

    const untouched = await prisma.client.findUniqueOrThrow({ where: { id: clientB.id } });
    expect(untouched.name).toBe('B Client');
  });
});
