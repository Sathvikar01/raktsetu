# RaktSetu

**An open-source, privacy-preserving transparency layer between blood banks/hospitals and blood donors.**
RaktSetu consumes blood-unit lifecycle events from existing blood-bank and hospital systems and shows each donor a verified journey of their own donation — while recipient privacy is protected by design, not by policy promises.

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

## What RaktSetu explicitly is NOT

1. Not a blood bank and not inventory management software.
2. Not an e-RaktKosh replacement or competitor.
3. Not a hospital information system (HIS) or laboratory information system (LIS).
4. Not a donor–recipient marketplace or contact channel.
5. Not a public medical-record database.
6. Not a blockchain project.
7. Never an exposer of recipient identities — recipient identity is not stored at all.
8. Not a carrier of donor serology/test results — deferral and result communication belongs to legally-compliant blood-centre workflows.
9. Not an AI decision system: disclosure, authorization and traceability are pure deterministic functions.
10. Not, by itself, legal compliance.

## Feature overview

```
 Blood bank / Hospital                RaktSetu                          Donor app
 ─────────────────────                ─────────                         ─────────
 collect unit D001   ──signed event──► append-only event log
                                      │ idempotency (sourceSystem,
                                      │ sourceEventId)
                     ◄──link code─────│ opaque single-use code ────────► donor links donation
 separate C001..C003 ──signed events─► derive state + lineage          ► timeline: one card
                                      │ (RBC · Plasma · Platelets)       per component
 transfer to hospital──signed event─► resolve destination facility
 transfused           ──signed event─► privacy engine decides        ► generic notification title;
                                      │ (consent ceiling, k-anonymity)   verified impact on timeline
 expiry / discard     ──signed event─► neutral lifecycle copy      ► gratitude, never shaming
```

Every donor-visible claim carries provenance: rendered message → DisclosureDecision → VERIFIED LifecycleEvent → Organization → source system + source event id.

## Quickstart

Prerequisites: **Node.js 20+** (Docker optional, for PostgreSQL). Windows users: all commands below are PowerShell-safe.

```powershell
# 1. Install dependencies
npm install

# 2a. Easiest start — SQLite (default, zero external services)
npm run db:push

# 2b. OR use PostgreSQL 16 (primary production target).
#     Start Postgres (docker compose once the ops-wave compose file lands, or any PG 16 instance):
#     docker compose up -d postgres
npm run db:use:postgres

# 3. Seed the demo world (wave-2 deliverable — this becomes THE demo command)
npm run seed

# 4. Run the app
npm run dev
```

Then open `http://localhost:3000`. All seeded content is clearly labelled SYNTHETIC.

### Environment

Copy `.env.example` to `.env` and adjust:

```powershell
Copy-Item .env.example .env
```

Generate a real `APP_SECRET` (32+ random bytes, PowerShell):

```powershell
$b = [byte[]]::new(32); [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

In production set **`DEMO_MODE=false`** — see docs/deployment.md.

### Demo accounts

The seed script creates a synthetic world with accounts in these shapes (exact passwords are defined by `scripts/seed.ts` when it ships — values below are placeholders until then and will be printed by `npm run seed`):

| Role | Email | Password |
| --- | --- | --- |
| Donor | `donor@demo.raktsetu.org` | placeholder — printed by `npm run seed` |
| Blood bank staff | `bbstaff@demo.raktsetu.org` | placeholder — printed by `npm run seed` |
| Hospital staff | `hospitalstaff@demo.raktsetu.org` | placeholder — printed by `npm run seed` |
| Platform admin | `admin@demo.raktsetu.org` | placeholder — printed by `npm run seed` |

Never reuse demo credentials outside the seeded local environment.

## Development commands

```powershell
npm run typecheck    # tsc --noEmit over the whole repo
npm run lint         # next lint
npm test             # vitest run (unit/integration/security suites)
npm run build        # production build
npm run db:generate  # prisma generate
npm run db:push      # schema sync to DATABASE_URL (dev default: SQLite)
npm run db:use:sqlite / npm run db:use:postgres   # provider switch + push
```

## Repository map

```
src/
  app/                     routes: (public) | (donor) | staff | admin | api/v1 | api/app
  packages/
    schemas/               zod contracts (events, API payloads, forms) — single source of truth
    database/              Prisma schema + client singleton + repositories
    domain/                event catalog, state derivation, lineage, idempotent ingestion
    privacy/               disclosure engine + re-identification guards (pure, deterministic)
    integrations/          BloodSystemAdapter interface, mock adapters, HMAC verification
    notifications/         channel-agnostic notification service
    ui/                    accessible Tailwind primitives + journey visualizations
  lib/                     auth/session, rbac, audit, crypto, rate-limit, i18n, stats services
tests/                     unit / integration / security / e2e (vitest)
scripts/                   seed.ts (synthetic world), db provider switch
docs/                      documentation suite
CONTRACTS.md               cross-cutting conventions — read before implementing
```

## Documentation index

| Document | Purpose |
| --- | --- |
| [CONTRACTS.md](CONTRACTS.md) | Hard rules and conventions. Read first. |
| [docs/problem-analysis.md](docs/problem-analysis.md) | Why this exists; boundaries; domain assumptions. |
| [docs/architecture.md](docs/architecture.md) | Modular monolith shape; event model; pipelines. |
| [docs/privacy-invariants.md](docs/privacy-invariants.md) | PI-1..PI-13, machine-enforced guarantees. |
| [docs/threat-model.md](docs/threat-model.md) | STRIDE analysis for this context. |
| [docs/privacy-model.md](docs/privacy-model.md) | Plain-language privacy design + DPDP mapping. |
| [docs/integration-guide.md](docs/integration-guide.md) | Partner onboarding; signed API reference. |
| [docs/deployment.md](docs/deployment.md) | Dev vs production deployment; operations. |
| [docs/acceptance-tests.md](docs/acceptance-tests.md) | Evaluation-first scenarios that define "correct". |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute; PR checklist. |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Contributor Covenant v2.1. |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting and disclosure policy. |

## Security reporting

Found a vulnerability? Do **not** open a public issue. See [SECURITY.md](SECURITY.md) for private reporting channels and our coordinated disclosure policy.

## License

[Apache License 2.0](LICENSE).

Chosen deliberately: a permissive license with an **explicit patent grant** maximizes adoption by hospitals, NGOs and universities, while retaining attribution. It is compatible with commercial self-hosting, so blood banks never face licensing friction when adopting or extending the platform. The canonical text lives at https://www.apache.org/licenses/LICENSE-2.0.txt and is reproduced unmodified in [LICENSE](LICENSE).
