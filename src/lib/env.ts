import "server-only";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  APP_SECRET: required(
    "APP_SECRET",
    process.env.NODE_ENV === "production"
      ? undefined
      : "dev-insecure-secret-change-me-0123456789abcdef"
  ),
  DATABASE_URL: required(
    "DATABASE_URL",
    process.env.NODE_ENV === "production" ? undefined : "file:./dev.db"
  ),
  DEMO_MODE: process.env.DEMO_MODE === "true",
  REPLAY_WINDOW_SECONDS: Number(process.env.REPLAY_WINDOW_SECONDS ?? 300),
  PRIVACY_MIN_COHORT: Number(process.env.PRIVACY_MIN_COHORT ?? 5),
  PRIVACY_MIN_AGGREGATE: Number(process.env.PRIVACY_MIN_AGGREGATE ?? 10),
  SESSION_TTL_DAYS: Number(process.env.SESSION_TTL_DAYS ?? 30),
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER ?? "console", // console | resend
  get isProd() {
    return this.NODE_ENV === "production";
  },
};
export const APP_NAME = "RaktSetu";
