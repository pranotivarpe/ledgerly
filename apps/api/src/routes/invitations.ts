import { Router } from 'express';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { toOrgSummary } from '../lib/serializers.js';
import { requireAuth } from '../middleware/auth.js';
import { getAuth } from '../middleware/tenant.js';
import {
  acceptInvitation,
  findInvitationByToken,
  invitationState,
} from '../services/invitation.service.js';

/** Public invitation endpoints, addressed by the raw token from the email link. */
export const invitationsRouter = Router();

invitationsRouter.get('/:token', async (req, res) => {
  const invitation = await findInvitationByToken(String(req.params.token));
  if (!invitation) throw HttpError.notFound('This invitation link is invalid');

  const userExists = Boolean(
    await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } }),
  );

  res.json({
    invitation: {
      email: invitation.email,
      role: invitation.role,
      state: invitationState(invitation),
      organization: {
        name: invitation.organization.name,
        brandColor: invitation.organization.brandColor,
      },
      invitedBy: invitation.invitedBy.name,
      userExists,
    },
  });
});

invitationsRouter.post('/:token/accept', requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const invitation = await findInvitationByToken(String(req.params.token));
  if (!invitation || invitationState(invitation) !== 'pending') {
    throw HttpError.badRequest('This invitation is no longer valid');
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.email !== invitation.email) {
    throw HttpError.forbidden(
      `This invitation was sent to ${invitation.email}. Log in with that account to accept it.`,
    );
  }

  const membership = await acceptInvitation(
    invitation.id,
    userId,
    invitation.role,
    invitation.organizationId,
  );
  res.json({ organization: toOrgSummary(invitation.organization, membership.role) });
});
