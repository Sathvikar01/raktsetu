# Deployment Guide

Two supported topologies:

| Mode | Database | Purpose |
| --- | --- | --- |
| Local development | SQLite (`file:./dev.db`) — zero external services | Day-to-day dev and demos |
| Production | PostgreSQL 16 via docker-compose (app + database) | Real deployments |

> **DISCLAIMER** — a production RaktSetu deployment must be operated by/with licensed blood centres and hospitals, and requires legal, clinical, security and regulatory review in your jurisdiction. This software is a transparency layer, not a medical device; running this code does not by itself establish DPDP/GDPR compliance.

## 1. Local development (no Docker required)

```powershell
npm install
Copy-Item .env.example .env      # defaults are fine for SQLite dev
npm run db:push                  # create schema in ./dev.db
npm run seed                     # synthetic demo world (wave-2 deliverable)
npm run dev
```

The Prisma schema is portable across PostgreSQL and SQLite (enums validated by zod, JSON stored as serialized strings), so feature parity between modes is maintained by avoiding PG-only types. Switch providers any time:

```powershell
npm run db:use:sqlite            # switch schema provider to sqlite + push
npm run db:use:postgres          # switch to postgresql + push (needs DATABASE_URL)
```

## 2. Production topology

Two supported production shapes:

- **Vercel** (this repository ships `vercel.json`): the platform runs the app;
  bring your own PostgreSQL 16 and set the environment variables below. A
  daily cron calls `/api/cron/outbox`; protect it with `CRON_SECRET`.
- **Self-managed**: run PostgreSQL 16 via docker-compose (`docker compose up -d db`
  uses the committed compose file, service name `db`) and the Next.js app on a
  Node host or your own container image (no Dockerfile is shipped — build one
  from `next build` output or use `next start`). Behind a reverse proxy that
  terminates TLS.

```powershell
# database only, from the repository root:
docker compose up -d db             # postgres:16 on 127.0.0.1:5432
```

Reference composition for a fully containerized stack (build your own app
image; treat this as the canonical definition):

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: raktsetu
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set a strong password}
      POSTGRES_DB: raktsetu
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U raktsetu -d raktsetu"]
      interval: 10s
      retries: 5

  app:
    image: raktsetu:latest        # your built image of this repository
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://raktsetu:${POSTGRES_PASSWORD}@db:5432/raktsetu
      APP_SECRET: ${APP_SECRET:?required}
      APP_URL: ${APP_URL:?required}
      DEMO_MODE: "false"
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:3000:3000"

volumes:
  pgdata:
```

Notes:

- The app binds to loopback only; publish it publicly exclusively through your TLS-terminating proxy.
- Never run the app container as root if your registry base image allows a non-root user.

### 2.1 Environment variables

Set in `.env` or compose `environment:` (never bake secrets into images).

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `APP_SECRET` | **yes in prod** | insecure dev fallback | Root key for credential encryption (AES-256-GCM of partner secrets), token peppering, HMAC key derivation. Generate with the PowerShell one-liner below. **Rotating it invalidates encrypted credential secrets — plan a rotation ceremony.** |
| `DATABASE_URL` | yes | `file:./dev.db` | Postgres: `postgresql://user:pass@host:5432/raktsetu`. SQLite: `file:./dev.db`. |
| `DEMO_MODE` | **must be `false` in prod** | `false` in `.env.example` | Enables the interactive demo journey, instant demo-donor view and relaxed aggregate thresholds. **A production deployment with `DEMO_MODE=true` is a misconfiguration.** |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | **yes in prod** | localhost (dev only) | Canonical absolute origin for emailed links and metadata. Production boot/build fails on a missing value or a localhost origin. |
| `EMAIL_PROVIDER` | no | `console` | `console` logs auth mail; `resend` delivers it via RESEND_API_KEY + EMAIL_FROM. Verification/reset mail is sent inline; outbox rows back retries. |
| `REQUIRE_ADMIN_MFA` | no | ON in prod | TOTP second factor for ORG_ADMIN / PLATFORM_ADMIN sign-ins. Set `false` only on pure-demo deployments. |
| `CRON_SECRET` | yes with Vercel cron | unset | Bearer token guarding `/api/cron/outbox`. |
| `PRIVACY_MIN_COHORT` | no | `5` | k-anonymity floor for LIMITED_ANON disclosure rendering. |
| `PRIVACY_MIN_AGGREGATE` | no | `10` | Suppression floor for public aggregate statistics. |
| `SESSION_TTL_DAYS` | no | `30` | Session lifetime. Shorten for higher-assurance deployments. |
| `REPLAY_WINDOW_SECONDS` | no | `300` | Signed-request timestamp skew tolerance. |
| `NODE_ENV` | yes in prod | `development` | Set to `production`. |

Generate `APP_SECRET` (PowerShell):

```powershell
$b = [byte[]]::new(32); [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

(or `openssl rand -base64 32` on POSIX).

### 2.2 TLS termination

Terminate TLS at your reverse proxy; the app serves plain HTTP on loopback. Enable HSTS and modern ciphers only. Minimal Caddy example (automatic certificates):

```
raktsetu.example.org {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options    "nosniff"
        Referrer-Policy           "strict-origin-when-cross-origin"
    }
}
```

(Replace `raktsetu.example.org` with your real hostname.) The application middleware additionally sets baseline security headers; the proxy layer is defense-in-depth. Restrict direct ingress to the app port at the firewall level.

## 3. Migrations workflow

- Development: `prisma db push` (via the npm scripts above) syncs the schema without migration files.
- Production: use proper migration history so upgrades are reviewable and repeatable:
  1. Create the baseline once: `npx prisma migrate diff --from-empty --to-schema-datamodel src/packages/database/schema.prisma --script > migrations\0_init.sql`, then mark it applied (`npx prisma migrate resolve --applied 0_init`).
  2. For each release: generate migrations from schema changes, review the SQL, apply with `npx prisma migrate deploy` during the maintenance window.
  3. Always take a backup (§4) before applying migrations.

## 4. Backup and restore

PostgreSQL:

```powershell
# backup (schedule daily; keep off-host copies)
docker compose exec -T postgres pg_dump -U raktsetu raktsetu > backup_raktsetu.sql

# restore into a fresh database
Get-Content backup_raktsetu.sql | docker compose exec -T postgres psql -U raktsetu -d raktsetu
```

Protect backups like PHI: encrypt at rest, restrict access, test restores quarterly. SQLite dev databases need no backup discipline beyond personal caution.

## 5. Logging posture

- Structured logs exclude payloads containing personal/medical data by construction; the error serializer redacts known sensitive keys, and unhandled API errors log only the error class name.
- Audit rows contain identifiers and action codes only — never clinical payloads.
- Operator obligations: do not enable request-body logging at the proxy; scrub any infrastructure-level access logs of query strings carrying identifiers; keep log retention short and access-controlled.
- Health endpoint for load balancers: `GET /api/health`.

## 6. Rate limiting at scale

The bundled limiter is a **DB-backed fixed window** (`RateLimitBucket`), shared
across all app instances and keyed by HMAC-hashed identities (emails/IPs are
never stored in plaintext). Public surfaces fail open on limiter errors;
auth/link controls fail closed. For very high-traffic deployments, point the
same interface at Redis so limits stay cluster-wide under heavy write load.
Keep the semantics identical (`429` + `Retry-After`) for partner integrations.

## 7. Retention policy configuration

Retention knobs and their meaning (legal review should fix final values per jurisdiction):

| Data | Retention guidance |
| --- | --- |
| `LifecycleEvent` rows | Append-only clinical provenance — retain for the platform's legal record period; corrections supersede but never delete. |
| `DisclosureConsent` | Honors `expiresAt`; expired consent fails closed automatically. Revoke on request (`revokedAt`). |
| Sessions / password-reset tokens | Expire per `SESSION_TTL_DAYS` / token TTL; prune expired rows periodically. |
| Notification & outbox rows | Prune delivered/read notifications after an operator-chosen window. |
| Donor account deletion | Cascades profile, sessions and preferences; donations de-link (donor reference cleared) while org-side lifecycle facts remain as anonymized provenance. |

Document your chosen values in your operations runbook and privacy notice; see docs/privacy-model.md for the rights mapping.

## 8. Upgrade path

1. Read the release notes; check for breaking env/schema changes.
2. Announce a maintenance window (ingestion partners receive `5xx`/timeouts and retry idempotently).
3. Backup (§4).
4. Pull the new revision; rebuild/redeploy the app.
5. Apply schema changes the way you manage them:
   - `db push` workflow (default): `npm run db:push` against the production database during the window; or
   - if you maintain a migration history (§3): `npx prisma migrate deploy`.
6. Start the new app version; verify `/api/health`, then smoke-test: donor login, event ingestion replay (should return `duplicate`), public stats page.
7. Roll back = previous image + restore backup if a schema change was destructive; otherwise previous image alone usually suffices.

Keep `DEMO_MODE=false`, secrets out of images, and the reverse proxy in front — every time.
