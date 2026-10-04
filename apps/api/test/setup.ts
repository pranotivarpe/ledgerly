// Tests run against a separate database so they never touch dev data.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/ledgerly_test`;
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-at-least-32-chars';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-at-least-32-chars';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key_for_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
