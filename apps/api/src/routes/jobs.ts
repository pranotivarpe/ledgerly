import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { env } from '../env.js';
import { resetDemo } from '../demo/reset.js';
import { runOverdueReminders } from '../jobs/overdue-reminders.js';
import { HttpError } from '../lib/http-error.js';

/** Endpoints for an external cron service. Disabled unless CRON_SECRET is set. */
export const jobsRouter = Router();

const requireCronSecret: RequestHandler = (req, _res, next) => {
  if (!env.CRON_SECRET) throw HttpError.notFound();
  const given = Buffer.from(req.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    throw HttpError.unauthorized();
  next();
};

jobsRouter.use(requireCronSecret);

jobsRouter.post('/overdue-reminders', async (_req, res) => {
  res.json(await runOverdueReminders());
});

jobsRouter.post('/reset-demo', async (_req, res) => {
  if (!env.DEMO_ENABLED) throw HttpError.notFound();
  await resetDemo();
  res.json({ ok: true });
});
