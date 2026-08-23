# Architecture

## Shape
Modular **monolith** (Next.js App Router, TypeScript) with strict internal package boundaries under
`src/packages/*`. Packages may only import downward (ui ← app routes ← services ← domain/privacy).
Extraction to a true workspace monorepo is mechanical later if needed; the boundaries are already
enforced by lint rules and directory discipline.

```
src/
  app/                     routes: (public) | (donor) | staff | admin | api/v1 | api/app
  packages/
    schemas/               zod contracts (events, API payloads, forms) — single source of truth
    database/              Prisma schema + client singleton + repositories
    domain/                event catalog, state derivation, lineage, idempotent ingestion
    privacy/               disclosure engine + re-identification guards (pure, deterministic)
    integrations/          BloodSystemAdapter interface, mock adapters, HMAC verification
    notifications/         channel-agnostic notification service (in-app/email now; SMS/WA/push later)
    ui/                    accessible Tailwind primitives + journey visualizations
  lib/                     auth/session, rbac, audit, crypto, rate-limit, i18n, stats services
tests/                     unit / integration / security / e2e (vitest)
scripts/                   seed.ts (synthetic world), db provider switch
docs/
```

## Event model (source of truth)
`LifecycleEvent` rows are append-only facts:
`id, donationId?, componentId?, eventType, organizationId, facilityId?, occurredAt, receivedAt,
sourceSystem, sourceEventId, verificationStatus, payload(JSON), previousEventId?,
correctionForEventId?, integrationId?`
Unique `(sourceSystem, sourceEventId)` ⇒ idempotency. Current status is **derived** by replaying
VERIFIED events in `(occurredAt, receivedAt)` order — never stored as mutable truth.

Event types (closed set, zod-validated):
`DONATION_COLLECTED, DONATION_PROCESSING_STARTED, SCREENING_COMPLETED, COMPONENT_CREATED,
COMPONENT_AVAILABLE, COMPONENT_RESERVED, COMPONENT_TRANSFERRED, COMPONENT_RECEIVED,
COMPONENT_ISSUED, COMPONENT_RETURNED, COMPONENT_TRANSFUSED, COMPONENT_EXPIRED,
COMPONENT_DISCARDED, COMPONENT_RECALLED, EVENT_CORRECTION`

## Lineage
`BloodComponent.donationId → Donation`; `ComponentLineage(parentId, childId, relation)` supports
DERIVED_FROM today and POOLED_INTO/SPLIT_FROM tomorrow without redesign. Donations render as a tree
of independent component journeys.

## Identification
Internal UUIDs everywhere; `ExternalIdentifier(scheme, value)` holds ISBT128_DIN |
FACILITY_BARCODE | ERAKTKOSH_ID | HOSPITAL_LOCAL. QR codes encode opaque internal ids only;
scans still require auth+authz.

## Ingestion pipeline (single path for ALL sources)
```
HTTP POST /api/v1/events ─┐
Staff simulator ──────────┼──► ingestEvent(): authenticate partner → verify HMAC+timestamp
Seed script ──────────────┘   → zod validate → resolve identifiers → tenant authz → idempotency
                              check → append LifecycleEvent(VERIFIED) → derive state →
                              privacy decision (if transfusion w/ context) → DisclosureDecision
                              → notifications dispatch → audit log
```
Demo data flows through the *same* pipeline as production integrations — no fake side-door.

## Privacy & Disclosure Engine (deterministic)
Pure functions in `packages/privacy`. Inputs: verified event, component type, DisclosureConsent
(NONE | BROAD_PURPOSE | LIMITED_ANON + whitelisted category + coarse age band), cohort statistics.
Output: granted level ≤ consent level, template key, sanitized params, degradation reason.
Fail-closed on every unknown/error path. k-anonymity floor before any LIMITED_ANON rendering.
Recipient identity is never an input because it is never stored.

## Adapter architecture
```ts
interface BloodSystemAdapter {
  id: string; kind: "BLOOD_BANK" | "HOSPITAL";
  getDonation(ref): Promise<DonationSnapshot|null>;
  getComponents(donationRef): Promise<ComponentSnapshot[]>;
  getLifecycleEvents(ref): Promise<NormalizedEvent[]>;
  verifyIdentifier(id): Promise<boolean>;
  normalizeEvent(raw): NormalizedEvent; // throws on unmappable
}
```
Shipped: `MockBloodBankAdapter`, `MockHospitalAdapter` (drive the simulator). Planned (documented
only until real APIs verified): CSVImport, FHIR/R4 (ABDM HIP pathway), e-RaktKosh, HIS/LIS.

## Auth & authorization
Custom session auth (self-hostable, zero vendor lock): scrypt password hashing, DB-backed sessions
in httpOnly SameSite=Lax cookies, CSRF double-submit tokens on mutating requests, per-IP+route rate
limits, MFA-ready schema (`mfaEnabled`, TOTP slot reserved). RBAC matrix (deny-by-default):
DONOR, ORG_STAFF, ORG_ADMIN, PLATFORM_ADMIN + org-scoped membership checks. Server components call
`requireRole()/requireOrgMember()`; middleware does coarse route gating.

## Notifications
Domain events → `notifications.dispatch(userId, key, params, {channels})` respecting
NotificationPreference. Channels implement a tiny interface; IN_APP writes DB, EMAIL writes an
outbox table (SMTP adapter documented). Lock-screen titles always generic.

## Data flow for §38 demo
Donor signup → BB staff records D001 (+link code) → donor links → simulator/API emits
COMPONENT_CREATED×3 → transfer/receive/transfuse via Hospital B partner key with disclosure
BROAD_PURPOSE/EMERGENCY_CARE → privacy engine approves → donor notified generically → timeline +
impact update → aggregates tick up. Every step audited.

## ABDM/FHIR readiness
Domain models stay wire-format-agnostic. A future FHIR adapter maps
`ServiceRequest/Procedure/Transport` + ABDM HIP consent artefacts onto `NormalizedEvent`s at the
adapter boundary only; core never learns FHIR. Documented in integration-guide.md.

## Deployment
Primary: docker-compose (app + PostgreSQL 16 + optional Caddy). Dev-without-Docker: SQLite via
`npm run db:use:sqlite` (provider swap script); feature parity maintained by avoiding PG-only types.
