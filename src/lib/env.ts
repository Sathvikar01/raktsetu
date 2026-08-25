import "server-only";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

/**
 * Canonical origin for links/OG tags. In production this is REQUIRED and must
 * be an absolute http(s) URL that is not localhost — the app refuses to boot
 * (and `next build` fails) rather than emailing localhost links. Dev keeps a
 * zero-config localhost default.
 */
function resolveAppUrl(): string {
  const isProd = process.env.NODE_ENV === "production";
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (!raw || raw.trim() === "") {
    if (isProd) {
      throw new Error(
        "APP_URL (or NEXT_PUBLIC_APP_URL) is REQUIRED in production — set it to the deployment origin, e.g. https://raktsetu.example.org"
      );
    }
    return "http://localhost:3000";
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid APP_URL "${raw}" — must be an absolute URL, e.g. https://host`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Invalid APP_URL "${raw}" — protocol must be http(s)`);
  }
  if (isProd && /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\[::1\])$/.test(parsed.hostname)) {
    throw new Error(
      `Invalid APP_URL "${raw}" — localhost origins are not allowed in production`
    );
  }
  return raw.replace(/\/+$/, "");
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
  APP_URL: resolveAppUrl(),
  get isProd() {
    return this.NODE_ENV === "production";
  },
};
export const APP_NAME = "RaktSetu";
