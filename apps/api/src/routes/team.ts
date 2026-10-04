import { Router } from 'express';
import { z } from 'zod';
import type { Role } from '../generated/prisma/enums.js';
import { HttpError } from '../lib/http-error.js';
import { can } from '../lib/permissions.js';
import { prisma } from '../lib/prisma.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { getAuth, getTenant, requirePermission } from '../middleware/tenant.js';
import { forbidInDemo } from '../middleware/demo.js';
import { parseBody } from '../middleware/validate.js';
import {
  assertSeatAvailable,
  inviteExpiry,
  issueAndSendInvite,
  seatUsage,
} from '../services/invitation.service.js';

/** Mounted at /api/orgs/:orgSlug — expects loadTenant to have run. */
export const teamRouter = Router({ mergeParams: true });

const roleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
const inviteSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

/**
 * Admins manage Members and Admins; only Owners can touch Owners or grant ownership.
 */
function assertCanManage(actorRole: Role, targetRole: Role, newRole?: Role) {
  if (actorRole === 'OWNER') return;
  if (targetRole === 'OWNER' || newRole === 'OWNER') {
    throw HttpError.forbidden('Only owners can change or remove owners');
  }
}

/** An organization must always keep at least one owner. */
async function assertNotLastOwner(organizationId: string, targetRole: Role) {
  if (targetRole !== 'OWNER') return;
  const owners = await prisma.membership.count({ where: { organizationId, role: 'OWNER' } });
  if (owners <= 1) {
    throw HttpError.badRequest(
      'An organization needs at least one owner. Promote someone else first.',
    );
  }
}

// ─── Members ─────────────────────────────────────────────────────────────────

teamRouter.get('/members', async (req, res) => {
  const { db, organization } = getTenant(req);
  const [members, seats] = await Promise.all([
    db.membership.findMany({
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    }),
    seatUsage(db, organization),
  ]);

  res.json({
    members: members.map((m) => ({ id: m.id, role: m.role, joinedAt: m.createdAt, user: m.user })),
    seats: { used: seats.used, limit: seats.limit },
  });
});

teamRouter.patch(
  '/members/:memberId',
  requirePermission('members:update'),
  forbidInDemo,
  async (req, res) => {
    const { db, role: actorRole, organization } = getTenant(req);
    const { userId } = getAuth(req);
    const { role: newRole } = parseBody(z.object({ role: roleSchema }), req);

    const target = await db.membership.findUnique({ where: { id: String(req.params.memberId) } });
    if (!target) throw HttpError.notFound('Member not found');
    if (target.role === newRole) {
      res.json({ member: { id: target.id, role: target.role } });
      return;
    }

    assertCanManage(actorRole, target.role, newRole);
    if (newRole !== 'OWNER') await assertNotLastOwner(organization.id, target.role);

    const updated = await db.membership.update({
      where: { id: target.id },
      data: { role: newRole },
    });
    await db.activityLog.create({
      data: {
        organizationId: organization.id,
        actorId: userId,
        action: 'member.role_changed',
        entityType: 'membership',
        entityId: target.id,
        metadata: { from: target.role, to: newRole },
      },
    });
    res.json({ member: { id: updated.id, role: updated.role } });
  },
);

/** Remove a member — or leave, when the target is yourself (allowed for every role). */
teamRouter.delete('/members/:memberId', forbidInDemo, async (req, res) => {
  const { db, role: actorRole, organization } = getTenant(req);
  const { userId } = getAuth(req);

  const target = await db.membership.findUnique({ where: { id: String(req.params.memberId) } });
  if (!target) throw HttpError.notFound('Member not found');

  const isSelf = target.userId === userId;
  if (!isSelf) {
    if (!can(actorRole, 'members:remove')) throw HttpError.forbidden();
    assertCanManage(actorRole, target.role);
  }
  await assertNotLastOwner(organization.id, target.role);

  await db.membership.delete({ where: { id: target.id } });
  await db.activityLog.create({
    data: {
      organizationId: organization.id,
      actorId: userId,
      action: isSelf ? 'member.left' : 'member.removed',
      entityType: 'membership',
      entityId: target.id,
    },
  });
  res.status(204).end();
});

// ─── Invitations ─────────────────────────────────────────────────────────────

teamRouter.get('/invitations', requirePermission('members:invite'), async (req, res) => {
  const { db } = getTenant(req);
  const invitations = await db.invitation.findMany({
    where: { acceptedAt: null },
    include: { invitedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      invitedBy: i.invitedBy.name,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      expired: i.expiresAt < new Date(),
    })),
  });
});

teamRouter.post(
  '/invitations',
  requirePermission('members:invite'),
  forbidInDemo,
  async (req, res) => {
    const { db, organization } = getTenant(req);
    const { userId } = getAuth(req);
    const { email, role } = parseBody(inviteSchema, req);

    const alreadyMember = await db.membership.findFirst({ where: { user: { email } } });
    if (alreadyMember)
      throw HttpError.conflict(`${email} is already a member of this organization`);

    // Re-inviting the same email replaces the old invitation instead of using another seat.
    const existing = await db.invitation.findFirst({ where: { email, acceptedAt: null } });
    if (!existing || existing.expiresAt < new Date()) await assertSeatAvailable(db, organization);

    const invitation = existing
      ? await db.invitation.update({
          where: { id: existing.id },
          data: { role, invitedById: userId },
        })
      : await db.invitation.create({
          data: {
            organizationId: organization.id,
            email,
            role,
            invitedById: userId,
            tokenHash: hashToken(generateToken()), // replaced when the email is issued
            expiresAt: inviteExpiry(),
          },
        });

    const inviter = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });
    const emailSent = await issueAndSendInvite(invitation, organization, inviter.name);

    await db.activityLog.create({
      data: {
        organizationId: organization.id,
        actorId: userId,
        action: 'member.invited',
        entityType: 'invitation',
        entityId: invitation.id,
        metadata: { email, role },
      },
    });

    res.status(201).json({ invitation: { id: invitation.id, email, role }, emailSent });
  },
);

teamRouter.post(
  '/invitations/:invitationId/resend',
  requirePermission('members:invite'),
  forbidInDemo,
  async (req, res) => {
    const { db, organization } = getTenant(req);
    const { userId } = getAuth(req);

    const invitation = await db.invitation.findUnique({
      where: { id: String(req.params.invitationId) },
    });
    if (!invitation || invitation.acceptedAt) throw HttpError.notFound('Invitation not found');
    // An expired invite no longer holds a seat, so resending it must claim one again.
    if (invitation.expiresAt < new Date()) await assertSeatAvailable(db, organization);

    const inviter = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });
    const emailSent = await issueAndSendInvite(invitation, organization, inviter.name);
    res.json({ emailSent });
  },
);

teamRouter.delete(
  '/invitations/:invitationId',
  requirePermission('members:invite'),
  async (req, res) => {
    const { db, organization } = getTenant(req);
    const { userId } = getAuth(req);

    const { count } = await db.invitation.deleteMany({
      where: { id: String(req.params.invitationId), acceptedAt: null },
    });
    if (count === 0) throw HttpError.notFound('Invitation not found');

    await db.activityLog.create({
      data: {
        organizationId: organization.id,
        actorId: userId,
        action: 'invitation.revoked',
        entityType: 'invitation',
        entityId: String(req.params.invitationId),
      },
    });
    res.status(204).end();
  },
);
