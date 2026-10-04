import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import { can, type Permission } from '../lib/permissions.js';
import { prisma } from '../lib/prisma.js';
import { forTenant } from '../lib/tenant.js';

/**
 * Resolves `:orgSlug` to an organization the current user belongs to.
 * Non-members get a 404 (not 403) so org slugs can't be probed for existence.
 */
export const loadTenant: RequestHandler = async (req, _res, next) => {
  const slug = req.params.orgSlug;
  if (!req.auth || typeof slug !== 'string') throw HttpError.unauthorized();

  const membership = await prisma.membership.findFirst({
    where: { userId: req.auth.userId, organization: { slug } },
    include: { organization: true },
  });
  if (!membership) throw HttpError.notFound('Organization not found');

  req.tenant = {
    organization: membership.organization,
    role: membership.role,
    db: forTenant(membership.organizationId),
  };
  next();
};

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.tenant || !can(req.tenant.role, permission)) throw HttpError.forbidden();
    next();
  };
}

/** Typed accessors for handlers mounted behind the middleware above. */
export function getAuth(req: Request) {
  if (!req.auth) throw HttpError.unauthorized();
  return req.auth;
}

export function getTenant(req: Request) {
  if (!req.tenant) throw new Error('getTenant() used on a route without loadTenant');
  return req.tenant;
}
