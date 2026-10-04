import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  WEB_URL: z.url().default('http://localhost:5180'),
  API_URL: z.url().default('http://localhost:4100'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // Email: without a Resend key, emails are logged and kept in a dev outbox (/api/dev/emails).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Ledgerly <onboarding@resend.dev>'),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Background jobs: in-process scheduler (single server) and/or an authenticated cron endpoint.
  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  CRON_SECRET: z.string().min(16).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:\n', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
