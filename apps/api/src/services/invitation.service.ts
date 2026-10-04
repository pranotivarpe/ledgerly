import { createElement } from 'react';
import { env } from '../env.js';
import { InviteEmail } from '../emails/invite-email.js';
import type { Invitation, Organization, Role } from '../generated/prisma/client.js';
import { sendEmail } from '../lib/email.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { PLAN_LIMITS, PLAN_NAMES } from '../lib/plans.js';
import { prisma } from '../lib/prisma.js';
import type { TenantDb } from '../lib/tenant.js';
import { generateToken, hashToken } from '../lib/tokens.js';

export const INVITE_TTL_DAYS = 7;

export function inviteExpiry() {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Seats in use = members + pending (unexpired, unaccepted) invitations. */
export async function seatUsage(db: TenantDb, org: Organization) {
  const [members, pending] = await Promise.all([
    db.membership.count(),
    db.invitation.count({ where: { acceptedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  return { used: members + pending, members, pending, limit: PLAN_LIMITS[org.plan].seats };
}

export async function assertSeatAvailable(db: TenantDb, org: Organization) {
  const { used, limit } = await seatUsage(db, org);
  if (used >= limit) {
    throw HttpError.paymentRequired(
      `Your ${PLAN_NAMES[org.plan]} plan includes ${limit} seat${limit === 1 ? '' : 's'}. Upgrade to invite more teammates.`,
    );
  }
}

/** Issues a fresh token (invalidating any previous link) and emails it. Returns false if delivery failed. */
export async function issueAndSendInvite(
  invitation: Pick<Invitation, 'id' | 'email' | 'role'>,
  org: Pick<Organization, 'name'>,
  inviterName: string,
) {
  const token = generateToken();
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { tokenHash: hashToken(token), expiresAt: inviteExpiry() },
  });

  try {
    await sendEmail({
      to: invitation.email,
      subject: `${inviterName} invited you to join ${org.name} on Ledgerly`,
      template: createElement(InviteEmail, {
        inviterName,
        organizationName: org.name,
        role: invitation.role,
        acceptUrl: `${env.WEB_URL}/invite/${token}`,
        expiresInDays: INVITE_TTL_DAYS,
      }),
    });
    return true;
  } catch (err) {
    logger.error({ err, invitationId: invitation.id }, 'failed to send invitation email');
    return false;
  }
}

/** Looks up a usable invitation by its raw token. */
export async function findInvitationByToken(token: string) {
  return prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: true, invitedBy: { select: { name: true } } },
  });
}

export function invitationState(inv: { acceptedAt: Date | null; expiresAt: Date }) {
  if (inv.acceptedAt) return 'accepted' as const;
  if (inv.expiresAt < new Date()) return 'expired' as const;
  return 'pending' as const;
}

/** Turns a pending invitation into a membership for `userId` (inside a transaction). */
export async function acceptInvitation(
  invitationId: string,
  userId: string,
  role: Role,
  organizationId: string,
) {
  return prisma.$transaction(async (tx) => {
    // Conditional update makes acceptance single-use even under concurrent requests.
    const { count } = await tx.invitation.updateMany({
      where: { id: invitationId, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (count === 0) throw HttpError.badRequest('This invitation is no longer valid');

    const membership = await tx.membership.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      create: { userId, organizationId, role },
      update: {},
    });
    await tx.activityLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'member.joined',
        entityType: 'membership',
        entityId: membership.id,
      },
    });
    return membership;
  });
}
