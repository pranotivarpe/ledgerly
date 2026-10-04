import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../env.js';
import { HttpError } from '../lib/http-error.js';
import { runOverdueReminders } from '../jobs/overdue-reminders.js';

/** Endpoints for an external cron service. Disabled unless CRON_SECRET is set. */
export const jobsRouter = Router();

jobsRouter.post('/overdue-reminders', async (req, res) => {
  if (!env.CRON_SECRET) throw HttpError.notFound();
  const given = Buffer.from(req.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    throw HttpError.unauthorized();

  res.json(await runOverdueReminders());
});
