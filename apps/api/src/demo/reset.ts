import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { seedDemo } from './seed-demo.js';

const DAY = 24 * 60 * 60 * 1000;

export async function resetDemo() {
  await seedDemo(prisma, (msg) => logger.info(msg));
  logger.info('🧹 demo workspace reset');
}

/**
 * Re-seeds the demo when it is missing or more than a day old. Called on startup and hourly rather
 * than relying on a 24-hour timer, which never fires on hosts that sleep idle instances (Render's
 * free plan), and would leave the demo's dates drifting further into the past.
 */
export async function resetDemoIfStale() {
  const demo = await prisma.organization.findFirst({
    where: { isDemo: true },
    select: { createdAt: true },
  });
  if (!demo || Date.now() - demo.createdAt.getTime() > DAY) await resetDemo();
}
