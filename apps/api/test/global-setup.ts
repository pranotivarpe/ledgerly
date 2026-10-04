import { execSync } from 'node:child_process';

// Bring the test database schema up to date before any test file runs.
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    `postgresql://${process.env.USER}@localhost:5432/ledgerly_test`;
  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: url },
  });
}
