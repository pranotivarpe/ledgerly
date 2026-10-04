import type { RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';

/**
 * The public demo workspace is shared by every visitor, so actions that would affect other
 * visitors (or reach real people/money) are disabled there. Everything else works normally and
 * the workspace is reset daily.
 */
export const forbidInDemo: RequestHandler = (req, _res, next) => {
  if (req.tenant?.organization.isDemo) {
    throw new HttpError(
      403,
      'This action is disabled in the demo workspace. Sign up to try it for real.',
      'DEMO_READONLY',
    );
  }
  next();
};
