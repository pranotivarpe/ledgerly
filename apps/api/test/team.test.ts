import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearOutbox, getOutbox } from '../src/lib/email.js';
import { prisma } from '../src/lib/prisma.js';
import { app, latestInviteToken, ORIGIN, resetDb, setPlan, signUp } from './helpers.js';

beforeEach(async () => {
  await resetDb();
  clearOutbox();
});

async function proOrg() {
  const owner = await signUp();
  await setPlan(owner.org.id, 'PRO');
  return owner;
}

function invite(agent: request.Agent, slug: string, email: string, role = 'MEMBER') {
  return agent.post(`/api/orgs/${slug}/invitations`).set('Origin', ORIGIN).send({ email, role });
}

describe('invitations', () => {
  it('the Free plan has a single seat, so inviting requires an upgrade (402)', async () => {
    const owner = await signUp();
    const res = await invite(owner.agent, owner.org.slug, 'new@example.com');
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PLAN_LIMIT');
    expect(res.body.error.message).toMatch(/Free plan includes 1 seat/);
  });

  it('sends an invitation email containing an accept link', async () => {
    const owner = await proOrg();
    const res = await invite(owner.agent, owner.org.slug, 'Designer@Example.com', 'ADMIN');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      invitation: { email: 'designer@example.com', role: 'ADMIN' },
      emailSent: true,
    });

    const { email } = await latestInviteToken();
    expect(email.to).toBe('designer@example.com');
    expect(email.subject).toContain(owner.org.name);
    expect(email.html).toContain('Accept invitation');
  });

  it('counts pending invitations against the seat limit', async () => {
    const owner = await proOrg(); // Pro = 3 seats; owner uses 1
    expect((await invite(owner.agent, owner.org.slug, 'a@example.com')).status).toBe(201);
    expect((await invite(owner.agent, owner.org.slug, 'b@example.com')).status).toBe(201);
    expect((await invite(owner.agent, owner.org.slug, 'c@example.com')).status).toBe(402);

    const members = await owner.agent.get(`/api/orgs/${owner.org.slug}/members`);
    expect(members.body.seats).toEqual({ used: 3, limit: 3 });
  });

  it('re-inviting the same email reuses the seat and invalidates the old link', async () => {
    const owner = await proOrg();
    await invite(owner.agent, owner.org.slug, 'a@example.com');
    const first = await latestInviteToken();
    await invite(owner.agent, owner.org.slug, 'a@example.com');
    const second = await latestInviteToken();

    expect(second.token).not.toBe(first.token);
    expect(await prisma.invitation.count()).toBe(1);
    expect((await request(app).get(`/api/invitations/${first.token}`)).status).toBe(404);
    expect((await request(app).get(`/api/invitations/${second.token}`)).status).toBe(200);
  });

  it('rejects inviting an existing member (409)', async () => {
    const owner = await proOrg();
    const res = await invite(owner.agent, owner.org.slug, owner.body.email);
    expect(res.status).toBe(409);
  });

  it('members cannot invite (403)', async () => {
    const owner = await proOrg();
    const member = await signUp();
    await prisma.membership.create({
      data: { userId: member.user.id, organizationId: owner.org.id, role: 'MEMBER' },
    });
    const res = await invite(member.agent, owner.org.slug, 'x@example.com');
    expect(res.status).toBe(403);
  });

  it('revoking an invitation kills its link', async () => {
    const owner = await proOrg();
    const created = await invite(owner.agent, owner.org.slug, 'a@example.com');
    const { token } = await latestInviteToken();

    await owner.agent
      .delete(`/api/orgs/${owner.org.slug}/invitations/${created.body.invitation.id}`)
      .set('Origin', ORIGIN)
      .expect(204);
    expect((await request(app).get(`/api/invitations/${token}`)).status).toBe(404);
  });
});

describe('accepting invitations', () => {
  it('shows public invitation details for a valid token', async () => {
    const owner = await proOrg();
    await invite(owner.agent, owner.org.slug, 'new@example.com', 'ADMIN');
    const { token } = await latestInviteToken();

    const res = await request(app).get(`/api/invitations/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.invitation).toMatchObject({
      email: 'new@example.com',
      role: 'ADMIN',
      state: 'pending',
      userExists: false,
      invitedBy: owner.body.name,
      organization: { name: owner.org.name },
    });
  });

  it('a new user signs up from the invite and joins the org (no new org created)', async () => {
    const owner = await proOrg();
    await invite(owner.agent, owner.org.slug, 'new@example.com', 'ADMIN');
    const { token } = await latestInviteToken();

    const res = await request(app).post('/api/auth/signup').set('Origin', ORIGIN).send({
      name: 'New Person',
      email: 'new@example.com',
      password: 'new-person-password',
      inviteToken: token,
    });
    expect(res.status).toBe(201);
    expect(res.body.organizations).toEqual([
      expect.objectContaining({ id: owner.org.id, role: 'ADMIN' }),
    ]);
    expect(await prisma.organization.count()).toBe(1);

    // Single use
    const again = await request(app).get(`/api/invitations/${token}`);
    expect(again.body.invitation.state).toBe('accepted');
  });

  it('invite signup must use the invited email', async () => {
    const owner = await proOrg();
    await invite(owner.agent, owner.org.slug, 'new@example.com');
    const { token } = await latestInviteToken();

    const res = await request(app).post('/api/auth/signup').set('Origin', ORIGIN).send({
      name: 'Imposter',
      email: 'other@example.com',
      password: 'imposter-password',
      inviteToken: token,
    });
    expect(res.status).toBe(400);
  });

  it('an existing user accepts while logged in with the invited email', async () => {
    const owner = await proOrg();
    const existing = await signUp({ email: 'existing@example.com' });
    await invite(owner.agent, owner.org.slug, 'existing@example.com');
    const { token } = await latestInviteToken();

    const res = await existing.agent.post(`/api/invitations/${token}/accept`).set('Origin', ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body.organization).toMatchObject({ id: owner.org.id, role: 'MEMBER' });

    const me = await existing.agent.get('/api/auth/me');
    expect(me.body.organizations).toHaveLength(2);

    const reuse = await existing.agent
      .post(`/api/invitations/${token}/accept`)
      .set('Origin', ORIGIN);
    expect(reuse.status).toBe(400);
  });

  it("a different logged-in user can't accept someone else's invite (403)", async () => {
    const owner = await proOrg();
    const eve = await signUp({ email: 'eve@example.com' });
    await invite(owner.agent, owner.org.slug, 'bob@example.com');
    const { token } = await latestInviteToken();

    const res = await eve.agent.post(`/api/invitations/${token}/accept`).set('Origin', ORIGIN);
    expect(res.status).toBe(403);
  });

  it('expired invitations cannot be accepted', async () => {
    const owner = await proOrg();
    const existing = await signUp({ email: 'late@example.com' });
    await invite(owner.agent, owner.org.slug, 'late@example.com');
    const { token } = await latestInviteToken();
    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await request(app).get(`/api/invitations/${token}`)).body.invitation.state).toBe(
      'expired',
    );
    const res = await existing.agent.post(`/api/invitations/${token}/accept`).set('Origin', ORIGIN);
    expect(res.status).toBe(400);
  });
});

describe('member management', () => {
  async function teamOf(...roles: ('ADMIN' | 'MEMBER' | 'OWNER')[]) {
    const owner = await proOrg();
    await setPlan(owner.org.id, 'TEAM');
    const others = [];
    for (const role of roles) {
      const u = await signUp();
      const membership = await prisma.membership.create({
        data: { userId: u.user.id, organizationId: owner.org.id, role },
      });
      others.push({ ...u, membershipId: membership.id });
    }
    const ownerMembership = await prisma.membership.findFirstOrThrow({
      where: { userId: owner.user.id, organizationId: owner.org.id },
    });
    return { owner: { ...owner, membershipId: ownerMembership.id }, others, slug: owner.org.slug };
  }

  const patchRole = (agent: request.Agent, slug: string, id: string, role: string) =>
    agent.patch(`/api/orgs/${slug}/members/${id}`).set('Origin', ORIGIN).send({ role });
  const remove = (agent: request.Agent, slug: string, id: string) =>
    agent.delete(`/api/orgs/${slug}/members/${id}`).set('Origin', ORIGIN);

  it('lists members with their roles and seat usage', async () => {
    const { owner, slug } = await teamOf('ADMIN', 'MEMBER');
    const res = await owner.agent.get(`/api/orgs/${slug}/members`);
    expect(res.body.members.map((m: { role: string }) => m.role)).toEqual([
      'OWNER',
      'ADMIN',
      'MEMBER',
    ]);
    expect(res.body.seats).toEqual({ used: 3, limit: 10 });
  });

  it('an owner can promote a member to admin', async () => {
    const { owner, others, slug } = await teamOf('MEMBER');
    const res = await patchRole(owner.agent, slug, others[0]!.membershipId, 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body.member.role).toBe('ADMIN');
  });

  it("an admin can't change an owner's role or make someone an owner", async () => {
    const { owner, others, slug } = await teamOf('ADMIN', 'MEMBER');
    const admin = others[0]!;
    expect((await patchRole(admin.agent, slug, owner.membershipId, 'MEMBER')).status).toBe(403);
    expect((await patchRole(admin.agent, slug, others[1]!.membershipId, 'OWNER')).status).toBe(403);
    expect((await patchRole(admin.agent, slug, others[1]!.membershipId, 'ADMIN')).status).toBe(200);
  });

  it('members cannot change roles', async () => {
    const { others, slug } = await teamOf('MEMBER', 'MEMBER');
    expect((await patchRole(others[0]!.agent, slug, others[1]!.membershipId, 'ADMIN')).status).toBe(
      403,
    );
  });

  it('the last owner cannot be demoted or leave', async () => {
    const { owner, slug } = await teamOf('ADMIN');
    expect((await patchRole(owner.agent, slug, owner.membershipId, 'ADMIN')).status).toBe(400);
    expect((await remove(owner.agent, slug, owner.membershipId)).status).toBe(400);
  });

  it('with two owners, one can step down', async () => {
    const { owner, slug } = await teamOf('OWNER');
    expect((await patchRole(owner.agent, slug, owner.membershipId, 'ADMIN')).status).toBe(200);
  });

  it('an admin can remove a member, who immediately loses access', async () => {
    const { others, slug } = await teamOf('ADMIN', 'MEMBER');
    const [admin, member] = others;
    expect((await member!.agent.get(`/api/orgs/${slug}`)).status).toBe(200);
    expect((await remove(admin!.agent, slug, member!.membershipId)).status).toBe(204);
    expect((await member!.agent.get(`/api/orgs/${slug}`)).status).toBe(404);
  });

  it("an admin can't remove an owner; a member can't remove anyone", async () => {
    const { owner, others, slug } = await teamOf('ADMIN', 'MEMBER');
    const [admin, member] = others;
    expect((await remove(admin!.agent, slug, owner.membershipId)).status).toBe(403);
    expect((await remove(member!.agent, slug, admin!.membershipId)).status).toBe(403);
  });

  it('any member can leave an organization', async () => {
    const { others, slug } = await teamOf('MEMBER');
    expect((await remove(others[0]!.agent, slug, others[0]!.membershipId)).status).toBe(204);
  });

  it("can't manage members of another organization", async () => {
    const a = await teamOf('MEMBER');
    const b = await signUp();
    expect((await remove(b.agent, a.slug, a.others[0]!.membershipId)).status).toBe(404);
    expect(getOutbox()).toHaveLength(0);
  });
});
