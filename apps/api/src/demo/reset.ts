import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { seedDemo } from './seed-demo.js';

export async function resetDemo() {
  await seedDemo(prisma, (msg) => logger.info(msg));
  logger.info('🧹 demo workspace reset');
}

export async function ensureDemoExists() {
  const exists = await prisma.organization.findFirst({
    where: { isDemo: true },
    select: { id: true },
  });
  if (!exists) await resetDemo();
}
