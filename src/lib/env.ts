import "server-only";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  APP_SECRET: process.env.APP_SECRET ?? "",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  DEMO_MODE: process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1",
  REPLAY_WINDOW_SECONDS: Number(process.env.REPLAY_WINDOW_SECONDS ?? 300),
  PRIVACY_MIN_COHORT: Number(process.env.PRIVACY_MIN_COHORT ?? 5),
  PRIVACY_MIN_AGGREGATE: Number(process.env.PRIVACY_MIN_AGGREGATE ?? 10),
  SESSION_TTL_DAYS: Number(process.env.SESSION_TTL_DAYS ?? 30),
  get isProd() {
    return this.NODE_ENV === "production";
  },
};

if (!env.APP_SECRET) {
  // Dev/demo convenience; production deployments must set APP_SECRET (see docs/deployment.md).
  env.APP_SECRET = "dev-insecure-secret-change-me-0123456789abcdef";
}
export const APP_NAME = "RaktSetu";
