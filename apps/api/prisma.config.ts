import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer auto-loads .env; in CI/production the vars come from the environment.
try {
  process.loadEnvFile();
} catch {
  // no .env file — fine
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
