# RaktSetu

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**An open-source, privacy-preserving transparency layer between blood banks/hospitals and blood donors.**
RaktSetu consumes blood-unit lifecycle events from existing blood-bank and hospital systems and shows each donor a verified journey of their own donation — while recipient privacy is protected by design, not by policy promises.

RaktSetu is also an **emergency blood discovery network**: a person at a hospital can raise a verified emergency blood request, and the platform resolves it along a fixed pipeline — **nearby blood banks first, then compatible verified donors nearby, with the search radius widening gradually and donor phone numbers staying private until a donor accepts**. The search never dead-ends: if local banks and donors can't cover it, the request stays open to the partner network until it expires.

> **DISCLAIMER — READ BEFORE DEPLOYING**
>
> RaktSetu is a **transparency layer, not a medical device**, and this source code alone does not make any deployment compliant with DPDP 2023, GDPR/HIPAA-equivalent rules, or blood-regulatory requirements.
> A real production deployment requires **licensed blood centres and hospitals** plus **legal, clinical, security and regulatory review** in your jurisdiction.
> The bundled demo world is synthetic; nothing in this repository establishes consent validity or clinical correctness.

## What RaktSetu is

- An **append-only lifecycle event log** (collection → processing → components → transfer → issue → transfusion/expiry/discard) with idempotent ingestion and auditable corrections.
- A **donor engagement surface**: donors link their donation via a single-use opaque code and follow each component's verified journey.
- A **privacy engine**: deterministic, fail-closed disclosure decisions with k-anonymity floors, fixed age bands and whitelisted treatment categories.
- A **partner integration API**: HMAC-SHA256-signed event submission for blood banks and hospitals (`POST /api/v1/events`).
- An **emergency blood discovery network** (`/emergency`): OTP-verified requests, blood-bank-first search with an ABO/Rh compatibility engine, progressive-radius donor fallback with privacy-first matching, live status tracking, and admin moderation.
- A **donor network** donors control: opt in with a verified mobile number, pause availability, cap the notification radius, and withdraw anytime — coordinates are quantized to ~1 km at write time.
- A **camps discovery surface** (`/camps`): verified organizations register donation camps; platform admins verify them before they go public; people find upcoming camps near them.

### Where it sits

RaktSetu replaces nothing — it wraps the systems you already run through thin adapters:

```
 e-RaktKosh / Blood Bank          RaktSetu platform           Hospital HIS / LIS
 ───────────────────────          ─────────────────           ───────────────────
        │                      append-only event log               ▲
        │  BloodSystemAdapter   idempotent ingestion                 │  BloodSystemAdapter
        ├──── signed events ──► state derivation + lineage           ├──── signed events ──
        │                      deterministic privacy engine          │
        ◄───── link codes ────  donor app (timelines, consent) ◄───── transfusion reports
```

Every donor-visible claim carries provenance: rendered message → DisclosureDecision → VERIFIED LifecycleEvent → Organization → source system + source event id.

## What RaktSetu explicitly is NOT

1. Not a blood bank, inventory system, e-RaktKosh replacement, or HIS/LIS.
2. Not a donor–recipient marketplace or contact channel; recipient identity is never stored at all.
3. Not a carrier of donor serology/test results — deferral and result communication stays with legally-compliant blood-centre workflows.
4. Not an AI decision system: disclosure, authorization, matching, compatibility and traceability are pure deterministic functions.
5. Not a medical or emergency-response service: the emergency network coordinates logistics only; in a life-threatening emergency, contact emergency services first. The onboarding eligibility questionnaire (`/eligibility`) is guidance only — final eligibility is always a medical professional's decision at the donation centre.
6. Not, by itself, legal compliance.

## Why I built it

Created by [**Sathvik**](https://github.com/Sathvikar01) — every time I donated blood, I walked out wondering: *was it actually used? Did it help someone?* I never got an answer. I realized a lot of donors feel the same, and that uncertainty makes it harder to come back.

RaktSetu is my attempt to close that loop — so people can quietly see where their blood was used, not as numbers, but as proof that their donation mattered. It's a simple, privacy-safe trail, verified at each step, without ever revealing who it helped. When donors can see that their gift counted, they feel more connected — and more motivated to donate again.

If you've donated, received blood, or kept one of these systems running — thank you for what you do.

## Privacy stance

Recipient identity is structurally absent from the data model (PI-1). Transfusion context reaches donors only through three consent levels:

| Level | Donor sees |
| --- | --- |
| 0 — Minimal | "Your donation was successfully transfused." Nothing more. |
| 1 — Broad purpose | Adds treatment purpose, e.g. "supported emergency care" — no age, facility, timing details. |
| 2 — Limited anonymous context | Adds a coarse age band, only when ≥ PRIVACY_MIN_COHORT similar cases exist so context cannot single anyone out. |

Decisions fail closed: unverified events, unknown categories and unverified consent degrade to neutral copy ("temporarily unavailable", "awaiting verification") — negative facts are never invented. No AI anywhere in disclosure, authorization or traceability paths. Full guarantees: [docs/privacy-invariants.md](docs/privacy-invariants.md).

## Quickstart

Prerequisites: **Node.js 20+** (Docker optional, for PostgreSQL). All commands are PowerShell-safe.

```powershell
npm install
Copy-Item .env.example .env     # adjust as needed
npm run db:push                 # SQLite dev database (default, zero external services)
npm run seed                    # synthetic demo world
npm run dev                     # http://localhost:3000 — all seeded content labelled SYNTHETIC
```

Generate a real `APP_SECRET` (32+ random bytes):

```powershell
$b = [byte[]]::new(32); [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

### PostgreSQL instead of SQLite

PostgreSQL 16 is the primary production target. Start it locally with Docker Compose:

```powershell
docker compose up -d db         # postgres:16-alpine on 127.0.0.1:5432 (dev credentials in the compose file)
npm run db:use:postgres         # switch provider + push schema
```

In `.env`, set `DATABASE_URL=postgresql://raktsetu:raktsetu_dev@localhost:5432/raktsetu`. Production composition (TLS proxy, strong secrets): [docs/deployment.md](docs/deployment.md). In production set **`DEMO_MODE=false`**.

## Demo

`npm run seed` creates a synthetic world (donor, blood-bank staff, hospital staff, platform admin — credentials printed by the seed script, never reuse them outside your machine). A step-by-step walkthrough of the full demo journey lives in [docs/demo-flow.md](docs/demo-flow.md).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server on :3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` over the whole repo |
| `npm run lint` | ESLint via next lint |
| `npm test` / `npm run test:watch` | vitest run (unit/integration/security suites) / watch mode |
| `npm run db:generate` | prisma generate |
| `npm run db:push` | Sync schema to `DATABASE_URL` (dev default: SQLite) |
| `npm run db:use:sqlite` / `db:use:postgres` | Switch database provider + push |
| `docker compose up -d db` | Local PostgreSQL 16 (loopback only) |
| `npm run seed` | Create the synthetic demo world |
| `npm run db:clean` | Remove demo-generated data (demo journeys / simulator rows) |
| `npm run outbox:process` | Drain queued emails now (same worker Vercel cron calls) |
| `npm run maintenance` | Outbox + expiry + reminders + emergency + camp sweeps |

## Emergency blood discovery

The resolution pipeline is a fixed, auditable order — the same core principle as the donor-journey engine: never claim anything the system hasn't verified, never dead-end a search:

```
EmergencyRequest (OTP-verified phone, hospital geo, urgency)
   → nearby blood banks        closest-first, ACTIVE orgs only
   → compatible inventory      ABO/Rh engine (RBC / plasma / platelet rules), AVAILABLE & unexpired units
   → nearby verified donors   phone-verified, available, past the 90-day deferral,
                               inside BOTH the request's radius rung and the donor's own
                               notification radius; notified ≤12 per rung, ≤40 per request
   → expanded radius           rung-by-rung ladder per urgency (e.g. EMERGENCY: 3→7→15→30→60→120 km),
                               with a dwell window per rung before widening
   → partner/camp network     final escalation; the request stays open until expiry
```

Request lifecycle: `PENDING → SEARCHING_BANKS → SEARCHING_DONORS → DONOR_FOUND → FULFILLED`, with `EXPIRED`/`CANCELLED` exits (expiry is 6h/24h/72h by urgency). Every stage transition is an append-only timeline event the requester watches live at `/emergency/{publicToken}` — no login needed; the unguessable token is the capability.

Privacy in matching is structural, not promised: matching runs server-side; requester surfaces see blood group and approximate distance (whole-km, quantized coordinates) only; a donor's name and masked phone appear to the requester **only after that donor accepts**; SMS/WhatsApp alert copy stays generic on lock screens. Duplicate and fake-request detection (active-request-per-phone, rapid repeats, clustered entries) flags suspicious requests for platform-admin moderation on `/admin/platform`; blocking halts the pipeline immediately.

Donor controls live under dashboard settings: pause availability (instant, invisible to every search), notification radius, location update, and full network withdrawal (wipes phone material and location instantly). Donors respond to matches on `/dashboard/requests`.

## Operations notes

- **Auth email** (verification, password reset) is delivered inline at enqueue
  time; `OutboxEmail` rows exist so the outbox worker can retry failures. On
  Vercel a daily cron hits `/api/cron/outbox` — guard it with `CRON_SECRET`.
  Locally, `npm run outbox:process` drains the queue on demand.
- **`APP_URL` / `NEXT_PUBLIC_APP_URL`** is REQUIRED in production and must be
  an absolute non-localhost origin; boot/build fails otherwise.
- **Donation reminders** ride the same maintenance cron (`/api/cron/outbox`
  or `npm run maintenance`): donors who opt in under dashboard settings get a
  single "likely eligible again" nudge ~90 days after their most recent linked
  donation — deduped by an append-only audit marker, so re-runs are no-ops.
- **Emergency network sweeps** run on `/api/cron/emergency` (Vercel cron every
  5 minutes; same `CRON_SECRET` bearer auth as the outbox cron) and are also
  part of `npm run maintenance`. The sweep expires stale emergency requests,
  advances active ones along the radius ladder, and auto-completes past camps.
  Status-page polls advance their own request too, so a requester watching the
  page sees progress even between cron ticks. Real SMS delivery requires
  registering a provider adapter via `setSmsSender()`; without one, codes and
  alerts surface as dev-only console output.
- **Admin MFA**: ORG_ADMIN and PLATFORM_ADMIN sign-ins require TOTP
  (`REQUIRE_ADMIN_MFA`, default ON in production; applies to ORG_STAFF, ORG_ADMIN and PLATFORM_ADMIN). Demo accounts get secrets
  provisioned by `npm run seed`; set `REQUIRE_ADMIN_MFA=false` for pure-demo
  deployments.

## Repository map

```
src/
  app/                     routes: (public: emergency | camps | eligibility | …) | dashboard | partner | staff | admin | mfa | demo | api/v1 | api/cron | api/health
  packages/
    schemas/               zod contracts (events, API payloads, forms) — single source of truth
    database/              Prisma schema + client singleton
    domain/                state derivation, lineage, idempotency, blood compatibility, geo, emergency state machine, eligibility rules (pure)
    privacy/               disclosure engine + re-identification guards (pure, deterministic)
    integrations/          BloodSystemAdapter interface, mock adapters, HMAC verification
    notifications/         channel-agnostic notification service (+ email outbox worker, SMS adapter point)
    ui/                    accessible Tailwind primitives + journey visualizations
  lib/                     auth/session+totp, rbac, audit, crypto, phone (E.164 + encrypt/hash/mask), rate-limit, env, services
  services/                emergency-requests (resolution pipeline), otp, donor-search, donor-network, camps, requests, inventory, …
tests/                     unit / integration / security (vitest)
scripts/                   seed.ts (synthetic world), clean-demo-data.ts, process-outbox.ts, maintenance.ts, db provider switch
CONTRACTS.md               cross-cutting conventions — read before implementing
```

## Documentation

| Document | Purpose |
| --- | --- |
| [CONTRACTS.md](CONTRACTS.md) | Hard rules and conventions. Read first. |
| [docs/problem-analysis.md](docs/problem-analysis.md) | Why this exists; boundaries; domain assumptions. |
| [docs/architecture.md](docs/architecture.md) | Modular monolith shape; event model; pipelines. |
| [docs/privacy-invariants.md](docs/privacy-invariants.md) | PI-1..PI-13, machine-enforced guarantees. |
| [docs/emergency-network.md](docs/emergency-network.md) | Emergency blood discovery: pipeline, lifecycle, security & privacy model. |
| [docs/threat-model.md](docs/threat-model.md) | STRIDE analysis for this context. |
| [docs/privacy-model.md](docs/privacy-model.md) | Plain-language privacy design + DPDP mapping. |
| [docs/integration-guide.md](docs/integration-guide.md) | Partner onboarding; signed API reference. |
| [docs/deployment.md](docs/deployment.md) | Dev vs production deployment; operations. |
| [docs/acceptance-tests.md](docs/acceptance-tests.md) | Evaluation-first scenarios that define "correct". |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute; PR checklist. |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Contributor Covenant v2.1. |

## Security reporting

Found a vulnerability? Do **not** open a public issue. See [SECURITY.md](SECURITY.md) for private reporting channels and our coordinated disclosure policy.

## License

[Apache License 2.0](LICENSE) — chosen deliberately: a permissive license with an **explicit patent grant** maximizes adoption by hospitals, NGOs and universities while retaining attribution. Copyright 2026 RaktSetu contributors.
