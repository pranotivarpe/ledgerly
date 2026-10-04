import type { RequestHandler } from 'express';
import { env } from '../env.js';
import { HttpError } from '../lib/http-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests. Browsers always send `Origin` on cross-site
 * state-changing requests, so a mismatching Origin is rejected. (SameSite=Lax cookies are the
 * first line of defence; this is the second.) Stripe webhooks have no Origin and pass through.
 */
export const originCheck: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  if (SAFE_METHODS.has(req.method) || !origin || origin === env.WEB_URL) return next();
  next(HttpError.forbidden('Cross-origin request blocked'));
};
