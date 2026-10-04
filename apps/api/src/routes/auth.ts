import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { env, isProd } from '../env.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../lib/cookies.js';
import { HttpError } from '../lib/http-error.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { toOrgSummary, toUserDto } from '../lib/serializers.js';
import { uniqueOrgSlug } from '../lib/slug.js';
import { requireAuth } from '../middleware/auth.js';
import { getAuth } from '../middleware/tenant.js';
import { parseBody } from '../middleware/validate.js';
import {
  acceptInvitation,
  findInvitationByToken,
  invitationState,
} from '../services/invitation.service.js';
import { createSession, revokeSession, rotateSession } from '../services/session.service.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 20 : 500, // strict in production, out of the way during local development
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

const email = z.email().trim().toLowerCase().max(254);
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

const signupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email,
    password,
    organizationName: z.string().trim().min(2).max(80).optional(),
    // Signing up from an invitation link joins that organization instead of creating one.
    inviteToken: z.string().min(1).optional(),
  })
  .refine((v) => v.inviteToken || v.organizationName, {
    path: ['organizationName'],
    message: 'Organization name is required',
  });

const loginSchema = z.object({ email, password: z.string().min(1).max(128) });

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = await hashPassword('timing-equaliser-password');

authRouter.post('/signup', authLimiter, async (req, res) => {
  const input = parseBody(signupSchema, req);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw HttpError.conflict('An account with this email already exists');

  const passwordHash = await hashPassword(input.password);

  if (input.inviteToken) {
    const invitation = await findInvitationByToken(input.inviteToken);
    if (!invitation || invitationState(invitation) !== 'pending') {
      throw HttpError.badRequest('This invitation is no longer valid');
    }
    if (invitation.email !== input.email) {
      throw HttpError.badRequest(`This invitation was sent to ${invitation.email}`);
    }
    // The invite link proves ownership of the address.
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, emailVerified: new Date() },
    });
    const membership = await acceptInvitation(
      invitation.id,
      user.id,
      invitation.role,
      invitation.organizationId,
    );

    const tokens = await createSession(user.id, req);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    res.status(201).json({
      user: toUserDto(user),
      organizations: [toOrgSummary(invitation.organization, membership.role)],
    });
    return;
  }

  const organizationName = input.organizationName!;
  const slug = await uniqueOrgSlug(organizationName);

  const { user, organization } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
    const organization = await tx.organization.create({
      data: {
        name: organizationName,
        slug,
        memberships: { create: { userId: user.id, role: 'OWNER' } },
        activity: { create: { actorId: user.id, action: 'organization.created' } },
      },
    });
    return { user, organization };
  });

  const tokens = await createSession(user.id, req);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res
    .status(201)
    .json({ user: toUserDto(user), organizations: [toOrgSummary(organization, 'OWNER')] });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const input = parseBody(loginSchema, req);

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !valid) {
    throw HttpError.unauthorized('Invalid email or password');
  }

  const tokens = await createSession(user.id, req);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res.json({ user: toUserDto(user) });
});

authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  const tokens = token ? await rotateSession(token, req) : null;
  if (!tokens) {
    clearAuthCookies(res);
    throw HttpError.unauthorized('Session expired');
  }
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  res.status(204).end();
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeSession(token);
  clearAuthCookies(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { organization: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!user) throw HttpError.unauthorized();

  res.json({
    user: toUserDto(user),
    organizations: user.memberships.map((m) => toOrgSummary(m.organization, m.role)),
  });
});
