import type { Request, RequestHandler } from 'express';
import { PORTAL_COOKIE } from '../lib/cookies.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { verifyPortalToken } from '../lib/tokens.js';

/** Resolves `:orgSlug` for public portal routes (branding, login). */
export async function loadPortalOrg(req: Request) {
  const org = await prisma.organization.findUnique({ where: { slug: String(req.params.orgSlug) } });
  if (!org) throw HttpError.notFound('Portal not found');
  return org;
}

/**
 * Authenticates a client contact. The session is bound to one organization, the contact must
 * still exist, and their client must not be archived — so access can be revoked at any time.
 */
export const requirePortalSession: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[PORTAL_COOKIE];
  if (!token) throw HttpError.unauthorized();

  let claims;
  try {
    claims = await verifyPortalToken(token);
  } catch {
    throw HttpError.unauthorized('Session expired');
  }

  const contact = await prisma.clientContact.findUnique({
    where: { id: claims.contactId },
    include: { client: { include: { organization: true } } },
  });
  const organization = contact?.client.organization;
  if (
    !contact ||
    !organization ||
    organization.id !== claims.organizationId ||
    organization.slug !== req.params.orgSlug ||
    contact.client.archivedAt
  ) {
    throw HttpError.unauthorized('Session expired');
  }

  const { client, ...contactOnly } = contact;
  const { organization: _org, ...clientOnly } = client;
  req.portal = { organization, contact: contactOnly, client: clientOnly };
  next();
};

export function getPortal(req: Request) {
  if (!req.portal) throw new Error('getPortal() used without requirePortalSession');
  return req.portal;
}
