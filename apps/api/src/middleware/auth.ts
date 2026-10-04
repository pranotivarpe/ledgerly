import type { RequestHandler } from 'express';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/tokens.js';

/** Verifies the access-token cookie and that its session hasn't been revoked (logout). */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) throw HttpError.unauthorized();

  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    throw HttpError.unauthorized('Session expired');
  }

  const session = await prisma.session.findUnique({
    where: { id: claims.sessionId },
    select: { userId: true },
  });
  if (!session || session.userId !== claims.userId) throw HttpError.unauthorized('Session expired');

  req.auth = claims;
  next();
};
