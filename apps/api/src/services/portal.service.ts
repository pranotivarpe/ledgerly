import { createElement } from 'react';
import { env } from '../env.js';
import { PortalLinkEmail } from '../emails/portal-link-email.js';
import type { Organization } from '../generated/prisma/client.js';
import { sendEmail } from '../lib/email.js';
import { prisma } from '../lib/prisma.js';
import { generateToken, hashToken } from '../lib/tokens.js';

export const LOGIN_LINK_TTL_MINUTES = 15;
export const INVITE_LINK_TTL_DAYS = 7;

/**
 * Finds (or lazily creates) the portal contact for an email address. Any active client whose
 * billing email matches can sign in — the agency doesn't have to set anything up.
 */
export async function findOrCreateContact(organizationId: string, email: string) {
  const existing = await prisma.clientContact.findUnique({
    where: { organizationId_email: { organizationId, email } },
    include: { client: true },
  });
  if (existing) return existing.client.archivedAt ? null : existing;

  const client = await prisma.client.findFirst({
    where: { organizationId, email, archivedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!client) return null;

  return prisma.clientContact.upsert({
    where: { organizationId_email: { organizationId, email } },
    create: { organizationId, clientId: client.id, email, name: client.name },
    update: {},
    include: { client: true },
  });
}

/** Creates a single-use magic link. `next` is a portal path to land on after signing in. */
export async function createPortalLinkUrl(
  org: Pick<Organization, 'slug'>,
  contactId: string,
  options: { ttlMs: number; next?: string },
) {
  const token = generateToken();
  await prisma.portalMagicLink.create({
    data: {
      contactId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + options.ttlMs),
    },
  });
  const url = new URL(`${env.WEB_URL}/portal/${org.slug}/verify`);
  url.searchParams.set('token', token);
  if (options.next) url.searchParams.set('next', options.next);
  return url.toString();
}

/** Creates a magic link and emails it to the contact. */
export async function sendPortalLink(
  org: Pick<Organization, 'id' | 'name' | 'slug'>,
  contact: { id: string; email: string; name: string },
  options: { ttlMs: number; next?: string; invitedBy?: string },
) {
  const url = await createPortalLinkUrl(org, contact.id, options);

  const minutes = Math.round(options.ttlMs / 60_000);
  await sendEmail({
    to: contact.email,
    subject: options.invitedBy
      ? `${org.name} invited you to their client portal`
      : `Your sign-in link for ${org.name}`,
    template: createElement(PortalLinkEmail, {
      organizationName: org.name,
      contactName: contact.name,
      url,
      expiresIn: minutes >= 1440 ? `${Math.round(minutes / 1440)} days` : `${minutes} minutes`,
      invitedBy: options.invitedBy,
    }),
  });
}

/** Consumes a magic link atomically. Returns the contact, or null if invalid/used/expired. */
export async function consumeMagicLink(organizationId: string, token: string) {
  const link = await prisma.portalMagicLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { contact: { include: { client: true } } },
  });
  if (!link || link.contact.organizationId !== organizationId) return null;

  const { count } = await prisma.portalMagicLink.updateMany({
    where: { id: link.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (count === 0 || link.contact.client.archivedAt) return null;

  await prisma.clientContact.update({
    where: { id: link.contactId },
    data: { lastLoginAt: new Date() },
  });
  return link.contact;
}

/** A 7-day sign-in link that lands on one invoice (omitted if the email maps to another client). */
export async function invoicePayLink(
  org: { id: string; slug: string },
  invoice: { id: string; clientId: string; client: { email: string } },
) {
  const contact = await findOrCreateContact(org.id, invoice.client.email);
  if (!contact || contact.clientId !== invoice.clientId) return undefined;
  return createPortalLinkUrl(org, contact.id, {
    ttlMs: INVITE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
    next: `/portal/${org.slug}/invoices/${invoice.id}`,
  });
}
