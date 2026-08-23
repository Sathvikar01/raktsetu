# CONTRACTS — read this first

Single source of truth for cross-cutting conventions. If code disagrees with this file, this file
wins. Read `docs/architecture.md`, `docs/privacy-invariants.md` and `docs/acceptance-tests.md`
before implementing anything.

## Stack & layout
Next.js 15 App Router (React 19), TypeScript strict, Tailwind 3.4, Prisma 5 (PostgreSQL primary /
SQLite dev fallback), zod 3, vitest 2. Single Next app = modular monolith.

```
src/packages/schemas      zod contracts + event catalog (EVENT_TYPES, InboundEventSchema…)
src/packages/database     schema.prisma + client.ts (prisma singleton)
src/packages/domain       pure derivation (derive.ts). NO "server-only" imports there.
src/packages/privacy      pure disclosure engine (engine.ts). NO server-only imports.
src/packages/notifications service.ts (server-only) — dispatchDonorNotification()
src/packages/integrations adapters (BloodSystemAdapter) + simulator service
src/packages/ui           presentational components only — no data fetching inside
src/lib                   env crypto auth/* rbac audit rate-limit api json services/*
src/lib/services/ingest   THE ingestion pipeline: ingestEvent() — all sources use it
src/i18n                  index.ts translate() + messages/en.ts dictionary
src/app/(public)          public pages · src/app/(donor) donor app · staff/ admin/ portals
src/app/api/v1            partner integration API (HMAC)
tests/{unit,integration,security,e2e}
```

## Hard rules
- **Privacy invariants PI-1..PI-13 are non-negotiable** (docs/privacy-invariants.md). Fail closed.
- Never render/log/persist recipient-identifying data. `sanitizeMetadata()` strips forbidden keys.
- LifecycleEvent rows are append-only. Corrections = new EVENT_CORRECTION events.
- All mutating staff/partner flows go through `ingestEvent()` — no side doors.
- i18n: every user-visible string via `translate(locale,key,params)` / server helper; add keys to
  `src/i18n/messages/en.ts` under your namespace only (public|donor|staff|admin|privacy|notify|common).
- No fake buttons/dead links/placeholder APIs. Every control must work against real services.
- No AI in authorization/disclosure/traceability paths (deterministic only).
- Server Components by default; `"use client"` only where interaction demands it.
- Accessibility: semantic landmarks, labeled inputs, focus-visible, aria-current on nav, alt text.
- IDs in URLs are internal UUIDs (opaque). Never put names/phones/external ids of people in URLs.
- Errors: use apiError()/handleApiError() envelopes; user-facing copy from privacy namespace
  ("temporarily unavailable", "awaiting verification") — never invent negative facts.

## Auth & RBAC quick reference
```ts
const user = await requireRole("DONOR");                    // redirects /login or /forbidden
await requireOrgMember(orgId);                              // staff scoping (ORG_ADMIN|STAFF)
can(user.role, "integration:write:own-org")                 // permission matrix in lib/rbac.ts
```
Mutating cookie-authed requests must verify CSRF: client sends header `x-csrf-token` =
cookie `rs_csrf`; call `verifyCsrf(req)` in API routes (server actions have built-in origin checks).

## Integration API (implemented over ingestEvent)
Headers: X-RaktSetu-Key, X-RaktSetu-Timestamp, X-RaktSetu-Signature (hex hmac-sha256 of
`${timestamp}.${rawBody}` with credential secret). ±300s window. Payload = InboundEventSchema.

## Derived state
Use `deriveComponentState()`/`deriveDonationProgress()` from packages/domain — never hand-roll
status logic in pages. BloodComponent.currentDerivedState is a cache refreshed after ingestion.

## Verification commands
```
npx tsc --noEmit        # type check whole repo
npx vitest run tests/unit/<yours>   # scoped tests
npm run build           # full build (only at integration gates)
npx prisma db push      # schema sync (sqlite dev default)
```

## Tone & UI
Calm, human, hopeful; red used sparingly as accent (crimson palette). Component colors: RBC red,
Plasma yellow, Platelets orange. Donor surfaces: timelines/cards, no dense tables. Staff/admin may
use tables. Mobile-first. Synthetic-data banners wherever demo content appears.
