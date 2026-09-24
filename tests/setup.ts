// Runs before each test file's imports: point the app at the test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/fenlark_test";
process.env.APP_URL = "http://localhost:3000";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.CRON_SECRET ??= "test-cron-secret";
delete process.env.RESEND_API_KEY;
delete process.env.OWNER_EMAIL;
