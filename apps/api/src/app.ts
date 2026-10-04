import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isProd } from './env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { originCheck } from './middleware/origin-check.js';
import { authRouter } from './routes/auth.js';
import { devRouter } from './routes/dev.js';
import { healthRouter } from './routes/health.js';
import { invitationsRouter } from './routes/invitations.js';
import { organizationsRouter } from './routes/organizations.js';
import { webhooksRouter } from './routes/webhooks.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.WEB_URL, credentials: true }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  // Webhooks need the raw request body for signature verification — mount before express.json().
  app.use('/api/webhooks', webhooksRouter);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(originCheck);

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/orgs', organizationsRouter);
  app.use('/api/invitations', invitationsRouter);
  if (!isProd) app.use('/api/dev', devRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
