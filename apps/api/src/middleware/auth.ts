import type { Request, RequestHandler } from 'express';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/tokens.js';

/** Claims from a valid, unrevoked access-token cookie; `null` when absent, expired or logged out. */
export async function readAccessToken(req: Request) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return null;

  const claims = await verifyAccessToken(token).catch(() => null);
  if (!claims) return null;

  const session = await prisma.session.findUnique({
    where: { id: claims.sessionId },
    select: { userId: true },
  });
  return session?.userId === claims.userId ? claims : null;
}

/** Verifies the access-token cookie and that its session hasn't been revoked (logout). */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  if (!req.cookies?.[ACCESS_COOKIE]) throw HttpError.unauthorized();
  const claims = await readAccessToken(req);
  if (!claims) throw HttpError.unauthorized('Session expired');

  req.auth = claims;
  next();
};
