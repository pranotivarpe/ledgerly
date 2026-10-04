import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { runOverdueReminders } from './overdue-reminders.js';

const HOUR = 60 * 60 * 1000;

/**
 * In-process scheduler for a single-server deployment. For serverless/multi-instance hosting, set
 * JOBS_ENABLED=false and call POST /api/jobs/overdue-reminders from a cron service instead —
 * the job is idempotent either way.
 */
export function startScheduler() {
  if (!env.JOBS_ENABLED || env.NODE_ENV === 'test') return () => {};

  const run = () =>
    runOverdueReminders().catch((err) => logger.error({ err }, 'overdue reminders job failed'));
  const first = setTimeout(run, 30_000);
  const interval = setInterval(run, HOUR);
  first.unref();
  interval.unref();
  logger.info('⏰ scheduler started (overdue reminders hourly)');
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
