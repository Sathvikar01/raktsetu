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

Primary target: **docker-compose running the Next.js app plus PostgreSQL 16**, behind a reverse proxy that terminates TLS.

```powershell
# from the repository root, once infrastructure files are present:
docker compose up -d             # app + postgres:16
```

Reference composition (the ops wave ships `Dockerfile` + `docker-compose.yml` at the repo root; until your checkout includes them, treat this as the canonical definition):

```yaml
services:
  postgres:
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
    image: raktsetu:latest        # built from this repository
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://raktsetu:${POSTGRES_PASSWORD}@postgres:5432/raktsetu
      APP_SECRET: ${APP_SECRET:?required}
      DEMO_MODE: "false"
    depends_on:
      postgres:
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
| `DEMO_MODE` | **must be `false` in prod** | `true` in `.env.example` | Enables simulator endpoints and relaxed aggregate thresholds for seeded data. **A production deployment with `DEMO_MODE=true` is a misconfiguration.** |
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

The bundled rate limiter is an in-memory sliding window — correct for single-instance deployments. For multi-node production, point the same interface at Redis (or an equivalent shared store) so limits are enforced cluster-wide. Keep the per-credential semantics identical (`429` + `Retry-After`) so partner integrations behave the same either way.

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
4. Pull the new revision; rebuild the app image.
5. Apply migrations: `npx prisma migrate deploy`.
6. Start the new app version; verify `/api/health`, then smoke-test: donor login, event ingestion replay (should return `duplicate`), public stats page.
7. Roll back = previous image + restore backup if a migration was destructive; otherwise previous image alone usually suffices.

Keep `DEMO_MODE=false`, secrets out of images, and the reverse proxy in front — every time.
