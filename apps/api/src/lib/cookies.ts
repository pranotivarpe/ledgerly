import type { CookieOptions, Response } from 'express';
import { isProd } from '../env.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  PORTAL_SESSION_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
} from './tokens.js';

export const ACCESS_COOKIE = 'll_access';
export const REFRESH_COOKIE = 'll_refresh';

const base: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
};

// The refresh cookie is only ever sent to the auth endpoints.
const refreshOptions: CookieOptions = { ...base, path: '/api/auth' };

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base,
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshOptions, maxAge: REFRESH_TOKEN_TTL_MS });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, refreshOptions);
}

// Client portal session — scoped to the portal API only.
export const PORTAL_COOKIE = 'll_portal';
const portalOptions: CookieOptions = { ...base, path: '/api/portal' };

export function setPortalCookie(res: Response, token: string) {
  res.cookie(PORTAL_COOKIE, token, { ...portalOptions, maxAge: PORTAL_SESSION_TTL_SECONDS * 1000 });
}

export function clearPortalCookie(res: Response) {
  res.clearCookie(PORTAL_COOKIE, portalOptions);
}
