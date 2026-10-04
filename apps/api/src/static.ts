import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './lib/logger.js';

/**
 * In production the API also serves the built React app, so the whole product lives on one
 * origin: auth cookies stay first-party (no third-party-cookie or CORS problems) and there's a
 * single service to deploy.
 */
export function serveWebApp(app: Express) {
  const here = dirname(fileURLToPath(import.meta.url)); // apps/api/dist
  const webDist = join(here, '../../web/dist');
  if (!existsSync(join(webDist, 'index.html'))) {
    logger.warn({ webDist }, 'web build not found — serving the API only');
    return;
  }

  // Hashed asset filenames never change, so they can be cached forever.
  app.use('/assets', express.static(join(webDist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));

  // Client-side routes (/app/…, /portal/…) all get the SPA shell; never cache it.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache').sendFile(join(webDist, 'index.html'));
  });
  logger.info('serving web app from %s', webDist);
}
