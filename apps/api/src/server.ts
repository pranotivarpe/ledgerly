import { createApp } from './app.js';
import { startScheduler } from './jobs/scheduler.js';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const stopScheduler = startScheduler();

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Ledgerly API listening on ${env.API_URL}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
