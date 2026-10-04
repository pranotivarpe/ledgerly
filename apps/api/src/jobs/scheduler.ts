import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { ensureDemoExists, resetDemo } from '../demo/reset.js';
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
  const timers: NodeJS.Timeout[] = [setTimeout(run, 30_000), setInterval(run, HOUR)];

  if (env.DEMO_ENABLED) {
    const fail = (err: unknown) => logger.error({ err }, 'demo reset failed');
    ensureDemoExists().catch(fail);
    timers.push(setInterval(() => resetDemo().catch(fail), 24 * HOUR));
  }

  timers.forEach((t) => t.unref());
  logger.info(
    `⏰ scheduler started (overdue reminders hourly${env.DEMO_ENABLED ? ', demo reset daily' : ''})`,
  );
  return () => timers.forEach((t) => clearTimeout(t));
}
