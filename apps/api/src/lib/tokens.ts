import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../env.js';

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function signAccessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('app')
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessKey);
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, accessKey, { algorithms: ['HS256'], audience: 'app' });
  if (!payload.sub || typeof payload.sid !== 'string') throw new Error('Malformed token');
  return { userId: payload.sub, sessionId: payload.sid };
}

/** Opaque, URL-safe random token (refresh tokens, invites, magic links). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Only hashes of opaque tokens are stored, so a DB leak doesn't leak live tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ─── Client portal sessions ──────────────────────────────────────────────────
// A separate audience means an agency access token can never be used on the portal and vice versa.

export const PORTAL_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function signPortalToken(contactId: string, organizationId: string): Promise<string> {
  return new SignJWT({ org: organizationId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(contactId)
    .setAudience('portal')
    .setIssuedAt()
    .setExpirationTime(`${PORTAL_SESSION_TTL_SECONDS}s`)
    .sign(accessKey);
}

export async function verifyPortalToken(token: string) {
  const { payload } = await jwtVerify(token, accessKey, {
    algorithms: ['HS256'],
    audience: 'portal',
  });
  if (!payload.sub || typeof payload.org !== 'string') throw new Error('Malformed token');
  return { contactId: payload.sub, organizationId: payload.org };
}
