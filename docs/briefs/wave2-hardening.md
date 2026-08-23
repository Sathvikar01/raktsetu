# BRIEF: Hardening — auth/security tests, docker-compose, repo polish (Wave 2)

Working dir: C:\Users\arsat\OneDrive\Desktop\blood (Windows, PowerShell).
FIRST read completely: CONTRACTS.md, src/lib/services/account.ts, src/lib/auth/passwords.ts,
src/lib/rate-limit.ts, src/lib/crypto.ts, tests/integration/journey-core.test.ts (DB bootstrap
pattern to copy), README.md, .env.example, package.json.

## Exclusive ownership (touch NOTHING else)
- tests/unit/security/auth-flow.test.ts (new), tests/unit/security/rate-limit.test.ts (new),
  docker-compose.yml (new), LICENSE (new), README.md (edit existing), .env.example (append-only
  fixes), CONTRIBUTING.md (minor polish allowed).
- NO src/** or en.ts edits. If you find a product bug, write the failing test, mark it
  it.skip? NO - keep it failing-free: report it in your final message with file:line and the
  minimal fix; do not patch src.

## Build
1. tests/unit/security/auth-flow.test.ts — same throwaway-sqlite pattern as journey-core
   (process.env.DATABASE_URL="file:./test-auth.db" BEFORE dynamic import; vi.mock("server-only");
   beforeAll prisma db push; afterAll cleanup). Cover registerDonor / authenticate /
   linkDonationToDonor:
   - register: success creates User(role DONOR) + DonorProfile + initial ConsentRecord if the
     service does so (assert what code actually does after reading account.ts); duplicate email
     -> EXISTS; weak password -> WEAK_PASSWORD.
   - authenticate: unknown email + wrong password BOTH yield INVALID (no user-enumeration
     difference in timing-safe compare semantics — assert same failure code); correct creds ->
     session payload; disabled user -> DISABLED.
   - rate limiting: exceeding attempt window yields RATE_LIMITED (use the real rate-limit fn
     path the service uses; if it keys by IP param, drive it directly).
   - linkDonationToDonor: valid linkCode links once; second different donor same code -> error;
     already-linked -> idempotent or explicit error per implementation.
2. tests/unit/security/rate-limit.test.ts — pure unit over rateLimit(key,limit,windowMs):
   allows up to limit, blocks limit+1 within window, resets after fake-advance (vi.useFakeTimers
   or injectable now if supported).
3. docker-compose.yml — services: db (postgres:16-alpine, POSTGRES_USER raktsetu,
   POSTGRES_PASSWORD raktsetu_dev, POSTGRES_DB raktsetu, healthcheck pg_isready, named volume,
   port 5432 only on 127.0.0.1) and optional app profile "app" (build ., env DATABASE_URL
   postgres://... , depends_on db healthy). Add brief usage comments at top (docker compose up
   db -> npm run db:use:postgres).
4. LICENSE — Apache License 2.0 full text, copyright line "Copyright 2026 RaktSetu contributors".
5. README.md — restructure existing content into: what RaktSetu is (transparency layer, NOT a
   blood bank; adapter diagram e-RaktKosh/BB <-> Adapter <-> Platform <-> Adapter <-> HIS/LIS);
   privacy stance summary (levels 0/1/2, no AI in disclosure/auth/trace paths); quickstart
   (sqlite path first, then Postgres w/ docker compose); demo flow pointer to docs/demo-flow.md;
   scripts table; security reporting pointer to SECURITY.md; license badge. Keep under ~180
   lines, factual, no marketing fluff.
6. .env.example — verify every var read by src/lib/env.ts exists w/ safe defaults + comment;
   append missing ones only.

## Verification gate (must pass before finishing)
1. npx tsc --noEmit -> exit 0
2. npx vitest run -> ALL green including your two new files
3. docker compose config validates syntax (docker may be down; `docker compose config -q` best
   effort — if daemon-less validation fails, note it and ensure YAML is hand-checked).
Report test results, any product bugs found (file:line + suggested fix), deviations.
