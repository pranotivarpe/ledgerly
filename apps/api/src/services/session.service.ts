import type { Request } from 'express';
import { prisma } from '../lib/prisma.js';
import { generateToken, hashToken, REFRESH_TOKEN_TTL_MS, signAccessToken } from '../lib/tokens.js';

function clientMeta(req: Request) {
  return { userAgent: req.get('user-agent')?.slice(0, 255) ?? null, ipAddress: req.ip ?? null };
}

async function issueTokens(userId: string, sessionId: string, refreshToken: string) {
  return { accessToken: await signAccessToken(userId, sessionId), refreshToken };
}

export async function createSession(userId: string, req: Request) {
  const refreshToken = generateToken();
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      ...clientMeta(req),
    },
  });
  return issueTokens(userId, session.id, refreshToken);
}

/**
 * Refresh-token rotation: each refresh token is single-use. Presenting it swaps in a new token
 * (same session row), so a stolen-and-replayed old token is simply rejected.
 */
export async function rotateSession(refreshToken: string, req: Request) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
  });
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const nextToken = generateToken();
  // Conditional update guards against two concurrent refreshes using the same token.
  const { count } = await prisma.session.updateMany({
    where: { id: session.id, tokenHash: session.tokenHash },
    data: {
      tokenHash: hashToken(nextToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      ...clientMeta(req),
    },
  });
  if (count === 0) return null;

  return issueTokens(session.userId, session.id, nextToken);
}

export async function revokeSession(refreshToken: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(refreshToken) } });
}
