import { render } from '@react-email/components';
import { randomUUID } from 'node:crypto';
import type { ReactElement } from 'react';
import { Resend } from 'resend';
import { env } from '../env.js';
import { logger } from './logger.js';

export type EmailAttachment = { filename: string; content: Buffer };

export type OutboxEmail = {
  id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; size: number }[];
  sentAt: Date;
};

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Development/test outbox: the most recent emails, newest first. Never used in production.
const OUTBOX_LIMIT = 50;
const outbox: OutboxEmail[] = [];

export function getOutbox(): readonly OutboxEmail[] {
  return outbox;
}

export function clearOutbox() {
  outbox.length = 0;
}

/**
 * Renders a React Email template and delivers it.
 * - Resend when RESEND_API_KEY is set
 * - otherwise logged + stored in the dev outbox (viewable at /api/dev/emails)
 */
export async function sendEmail({
  to,
  subject,
  template,
  attachments = [],
}: {
  to: string;
  subject: string;
  template: ReactElement;
  attachments?: EmailAttachment[];
}) {
  const [html, text] = await Promise.all([render(template), render(template, { plainText: true })]);

  if (resend && env.NODE_ENV !== 'test') {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
      attachments,
    });
    if (error) throw new Error(`Email delivery failed: ${error.message}`);
    logger.info({ to, subject }, 'email sent');
    return;
  }

  outbox.unshift({
    id: randomUUID(),
    to,
    subject,
    html,
    text,
    attachments: attachments.map((a) => ({ filename: a.filename, size: a.content.length })),
    sentAt: new Date(),
  });
  outbox.length = Math.min(outbox.length, OUTBOX_LIMIT);
  if (env.NODE_ENV === 'development') {
    logger.info({ to, subject }, `📧 email captured — view at ${env.WEB_URL}/api/dev/emails`);
  }
}

/**
 * For notifications that must never break the action that triggered them (receipts, alerts):
 * failures are logged, not thrown.
 */
export async function sendEmailSafely(...args: Parameters<typeof sendEmail>) {
  try {
    await sendEmail(...args);
    return true;
  } catch (err) {
    logger.error({ err, to: args[0].to, subject: args[0].subject }, 'notification email failed');
    return false;
  }
}
