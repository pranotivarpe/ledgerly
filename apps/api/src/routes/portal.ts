import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { env, isProd } from '../env.js';
import { clearPortalCookie, setPortalCookie } from '../lib/cookies.js';
import { HttpError } from '../lib/http-error.js';
import { stripe } from '../lib/stripe.js';
import { forTenant } from '../lib/tenant.js';
import { signPortalToken } from '../lib/tokens.js';
import { getPortal, loadPortalOrg, requirePortalSession } from '../middleware/portal.js';
import { parseBody } from '../middleware/validate.js';
import { renderInvoicePdf } from '../pdf/invoice-pdf.js';
import { recordInvoiceCheckout } from '../services/invoice-payment.service.js';
import {
  invoiceInclude,
  markOverdue,
  toInvoiceDto,
  toPdfData,
} from '../services/invoice.service.js';
import {
  consumeMagicLink,
  findOrCreateContact,
  LOGIN_LINK_TTL_MINUTES,
  sendPortalLink,
} from '../services/portal.service.js';

/** Client-facing portal API, mounted at /api/portal/:orgSlug. */
export const portalRouter = Router({ mergeParams: true });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 10 : 500,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

const safeNext = (slug: string, next?: string) =>
  next && next.startsWith(`/portal/${slug}/`) && !next.includes('//') ? next : undefined;

// ─── Public ──────────────────────────────────────────────────────────────────

portalRouter.get('/info', async (req, res) => {
  const org = await loadPortalOrg(req);
  res.json({
    organization: {
      name: org.name,
      slug: org.slug,
      brandColor: org.brandColor,
      logoUrl: org.logoUrl,
    },
  });
});

/** Always answers the same way, so the portal can't be used to discover who is a client. */
portalRouter.post('/magic-link', loginLimiter, async (req, res) => {
  const org = await loadPortalOrg(req);
  const { email, next } = parseBody(
    z.object({
      email: z.email().trim().toLowerCase().max(254),
      next: z.string().max(300).optional(),
    }),
    req,
  );

  const contact = await findOrCreateContact(org.id, email);
  if (contact) {
    await sendPortalLink(org, contact, {
      ttlMs: LOGIN_LINK_TTL_MINUTES * 60_000,
      next: safeNext(org.slug, next),
    });
  }
  res.json({ ok: true });
});

portalRouter.post('/verify', loginLimiter, async (req, res) => {
  const org = await loadPortalOrg(req);
  const { token } = parseBody(z.object({ token: z.string().min(1).max(200) }), req);

  const contact = await consumeMagicLink(org.id, token);
  if (!contact) throw HttpError.badRequest('This sign-in link is invalid or has expired');

  setPortalCookie(res, await signPortalToken(contact.id, org.id));
  res.json({ contact: { name: contact.name, email: contact.email } });
});

portalRouter.post('/logout', (_req, res) => {
  clearPortalCookie(res);
  res.status(204).end();
});

// ─── Authenticated ───────────────────────────────────────────────────────────

const authed = Router({ mergeParams: true });
portalRouter.use(requirePortalSession, authed);

/** Tenant-scoped queries further narrowed to the signed-in contact's client. */
function clientInvoices(req: Request) {
  const { organization, client } = getPortal(req);
  const db = forTenant(organization.id);
  return { db, where: { clientId: client.id, status: { not: 'DRAFT' as const } } };
}

async function loadInvoice(req: Request) {
  const { db, where } = clientInvoices(req);
  const invoice = await db.invoice.findFirst({
    where: { ...where, id: String(req.params.invoiceId) },
    include: invoiceInclude,
  });
  if (!invoice) throw HttpError.notFound('Invoice not found');
  return invoice;
}

authed.get('/me', (req, res) => {
  const { contact, client, organization } = getPortal(req);
  res.json({
    contact: { name: contact.name, email: contact.email },
    client: { name: client.name, company: client.company },
    organization: {
      name: organization.name,
      slug: organization.slug,
      brandColor: organization.brandColor,
    },
  });
});

authed.get('/invoices', async (req, res) => {
  const { db, where } = clientInvoices(req);
  await markOverdue(db);
  const invoices = await db.invoice.findMany({
    where,
    orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
    select: {
      id: true,
      number: true,
      status: true,
      currency: true,
      issueDate: true,
      dueDate: true,
      totalCents: true,
      paidAt: true,
      project: { select: { name: true } },
    },
  });
  const outstandingCents = invoices
    .filter((i) => i.status === 'SENT' || i.status === 'OVERDUE')
    .reduce((sum, i) => sum + i.totalCents, 0);
  res.json({ invoices, outstandingCents });
});

authed.get('/invoices/:invoiceId', async (req, res) => {
  const { organization } = getPortal(req);
  await markOverdue(forTenant(organization.id));
  const invoice = await loadInvoice(req);
  res.json({
    invoice: toInvoiceDto(invoice),
    organization: {
      name: organization.name,
      address: organization.address,
      brandColor: organization.brandColor,
    },
  });
});

authed.get('/invoices/:invoiceId/pdf', async (req, res) => {
  const { organization } = getPortal(req);
  const invoice = await loadInvoice(req);
  const pdf = await renderInvoicePdf(toPdfData(invoice, organization));
  res
    .type('application/pdf')
    .set(
      'Content-Disposition',
      `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${invoice.number}.pdf"`,
    )
    .set('Cache-Control', 'private, no-store')
    .send(pdf);
});

/** Starts a one-off Stripe Checkout payment for the invoice's exact total. */
authed.post('/invoices/:invoiceId/pay', async (req, res) => {
  const { organization, contact } = getPortal(req);
  const invoice = await loadInvoice(req);
  if (invoice.status !== 'SENT' && invoice.status !== 'OVERDUE') {
    throw HttpError.conflict(
      invoice.status === 'PAID' ? 'This invoice is already paid' : 'This invoice is not payable',
    );
  }

  const base = `${env.WEB_URL}/portal/${organization.slug}/invoices/${invoice.id}`;
  const metadata = { kind: 'invoice', invoiceId: invoice.id, organizationId: organization.id };
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: contact.email,
    client_reference_id: invoice.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: invoice.totalCents,
          product_data: {
            name: `Invoice ${invoice.number}`,
            description: `${organization.name}${invoice.project ? ` · ${invoice.project.name}` : ''}`,
          },
        },
      },
    ],
    metadata,
    payment_intent_data: {
      metadata,
      description: `${organization.name} — invoice ${invoice.number}`,
    },
    success_url: `${base}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?checkout=canceled`,
  });

  await forTenant(organization.id).invoice.update({
    where: { id: invoice.id },
    data: { stripeCheckoutSessionId: session.id },
  });
  res.json({ url: session.url });
});

/** Confirms a payment on return from Checkout, so the client doesn't wait for the webhook. */
authed.post('/invoices/:invoiceId/confirm', async (req, res) => {
  const invoice = await loadInvoice(req);
  const { sessionId } = parseBody(z.object({ sessionId: z.string().startsWith('cs_') }), req);

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  // The session must be for this exact invoice — never trust the ID from the URL on its own.
  if (session.metadata?.invoiceId !== invoice.id)
    throw HttpError.badRequest('Payment does not match this invoice');
  await recordInvoiceCheckout(session);

  const fresh = await loadInvoice(req);
  res.json({ invoice: toInvoiceDto(fresh), paid: fresh.status === 'PAID' });
});
