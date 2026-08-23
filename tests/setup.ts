// Vitest global setup — ensures a deterministic, isolated environment per run.
process.env.DEMO_MODE = "true";
process.env.APP_SECRET =
  process.env.APP_SECRET ?? "test-secret-0123456789abcdef0123456789abcdef";
if (!process.env.DATABASE_URL?.includes("file:") && !process.env.DATABASE_URL?.includes("postgres")) {
  process.env.DATABASE_URL = `file:./tests-${
    process.env.VITEST_POOL_ID ?? "0"
  }-${Date.now()}.db`;
}
process.env.PRIVACY_MIN_COHORT = process.env.PRIVACY_MIN_COHORT ?? "5";
process.env.PRIVACY_MIN_AGGREGATE = process.env.PRIVACY_MIN_AGGREGATE ?? "10";
