# Demo flow — seed, simulate, and evidence walkthrough

This is the zero-credentials demo path (AT-12): a fresh clone becomes a fully synthetic,
clearly-labelled world in which one donation travels from the blood bank to a transfused
RBC at a hospital — through exactly the same `ingestEvent()` pipeline as production events.

All data produced by this flow is **SYNTHETIC**. Every artifact it creates (orgs, users,
donations, components) exists only to demonstrate behavior; nothing describes real people
or facilities.

## Prerequisites

- Node 24
- `npm ci`
- A `.env` at the repo root (defaults shown; see `.env.example`):

  ```env
  APP_SECRET=dev-insecure-secret-change-me-0123456789abcdef
  DATABASE_URL=file:./dev.db        # SQLite dev fallback -> src/packages/database/dev.db
  DEMO_MODE=true                    # required by npm run seed / npm run simulate
  PRIVACY_MIN_COHORT=5
  PRIVACY_MIN_AGGREGATE=10
  SESSION_TTL_DAYS=30
  REPLAY_WINDOW_SECONDS=300
  ```

## Commands (in order)

```powershell
npx prisma generate        # generate the Prisma client from schema.prisma
npm run db:use:sqlite      # switch provider to sqlite + prisma generate + db push
npm run seed               # idempotent synthetic demo seed
npm run simulate           # run the full donation journey headlessly
```

The CLI journey does **not** require the dev server — `simulate` drives domain services
directly (`bloodbank-ops` / `hospital-ops` → `ingestEvent()`). Start `npm run dev` only if
you want to click through the web UI afterwards.

Both scripts refuse to run when `DEMO_MODE` is not `"true"`:

```
[seed] REFUSED: DEMO_MODE is not "true". This script seeds synthetic demo data.
Set DEMO_MODE=true in .env or re-run with --force.
```

## Step 1 — `npm run seed` (actual output)

Idempotent: re-running updates the same rows instead of duplicating them. Integration
credentials are issued **once per org** — on re-runs only the `keyId` is shown again.

First run (plaintext secrets redacted here; your console prints them in full):

```
[seed] Seeding synthetic demo world (DEMO_MODE)...

=== Demo seed summary (SYNTHETIC DATA — not real people or facilities) ===
  Organization    | Seva Blood Centre (BLOOD_BANK, ACTIVE)
  Organization    | City General Hospital (HOSPITAL, ACTIVE)
  Facility        | Seva Blood Centre / Main Lab [SBC-LAB] PROCESSING_LAB
  Facility        | City General Hospital / Main Campus [MAIN -> CGH-MAIN] HOSPITAL
  User            | admin@demo.local PLATFORM_ADMIN (password: demo-pass-1234)
  User            | bb-staff@demo.local ORG_STAFF (password: demo-pass-1234)
  User            | hosp-staff@demo.local ORG_STAFF (password: demo-pass-1234)
  User            | donor@demo.local DONOR (password: demo-pass-1234)
  Membership      | bb-staff@demo.local ORG_ADMIN @ Seva Blood Centre
  Membership      | hosp-staff@demo.local ORG_ADMIN @ City General Hospital
  DonorProfile    | donor@demo.local blood group O+ (default notification prefs)
  Integration NEW | Seva Blood Centre LIS keyId=rk_o3eNgGvu9RY secret printed above (shown ONCE)
  Integration NEW | City General Hospital LIS keyId=rk_DXcmtm91tlg secret printed above (shown ONCE)

  WARNING (dev only): plaintext integration secret for "Seva Blood Centre LIS":
    keyId:   rk_o3eNgGvu9RY
    secret:  FFKfsIfV0iwWznN_…(redacted in docs; printed once in the real output)
  Shown ONCE at issue time; never stored in the clear. Do NOT use in production.

  WARNING (dev only): plaintext integration secret for "City General Hospital LIS":
    keyId:   rk_DXcmtm91tlg
    secret:  vmU4G6savSY7XR5…(redacted in docs; printed once in the real output)
  Shown ONCE at issue time; never stored in the clear. Do NOT use in production.

  Totals in DB: 2 orgs, 2 facilities, 4 users, 2 integrations
=== Seed complete ===
```

Second run proves idempotency (no new integrations, no secrets):

```
  Integration  | Seva Blood Centre LIS keyId=rk_o3eNgGvu9RY
  Integration  | City General Hospital LIS keyId=rk_DXcmtm91tlg

  Totals in DB: 2 orgs, 2 facilities, 4 users, 2 integrations
=== Seed complete ===
```

Demo accounts (synthetic, dev-only): `admin@demo.local`, `bb-staff@demo.local`,
`hosp-staff@demo.local`, `donor@demo.local` — all with password `demo-pass-1234`.

## Step 2 — `npm run simulate` (actual output)

Runs donation → processing/screening → three components → RBC transfer → receipt →
transfusion (disclosure request: BROAD_PURPOSE, EMERGENCY_CARE), auto-linking the
donation to the donor account.

```
RaktSetu demo journey — ALL DATA IS SYNTHETIC (synthetic demo)
Donor account: donor@demo.local

Journey checklist:
  [1/6] DONATION_COLLECTED: Donation W262350001 collected at Seva Blood Centre (synthetic demo)
  [2/6] PROCESSING_COMPLETED: Processing + screening completed (synthetic demo)
  [3/6] COMPONENTS_CREATED: RBC + plasma + platelet prepared (synthetic demo)
  [4/6] COMPONENT_TRANSFERRED: RBC transferred to City General Hospital (synthetic demo)
  [5/6] COMPONENT_RECEIVED: Received at City General Hospital (synthetic demo)
  [6/6] COMPONENT_TRANSFUSED: Transfused in emergency care (synthetic demo)

Final component states (derived cache; events are truth):
  PLASMA    -> AVAILABLE
  PLATELET  -> AVAILABLE
  RBC       -> TRANSFUSED

Disclosure granted level: BROAD_PURPOSE (EMERGENCY_CARE)
In-app notifications for donor@demo.local: 2 (titles always generic — lock-screen safe)

Donation link code (single-use, opaque): cmt5jneqi00017rngvmqf2ihm
Done. Sign in as the donor above to see the timeline + verified impact.
```

Useful flags: `--donor-email=<email>` links the journey to another donor account;
`--force` bypasses the DEMO_MODE gate. Re-running `simulate` performs an additional
journey each time (new donation, new components).

## Donor perspective (sign-in walkthrough)

Start `npm run dev` and sign in at `/login` as `donor@demo.local` / `demo-pass-1234`.
A synthetic-data banner is displayed wherever demo content appears.

**After linking**, the dashboard shows the donation behind DIN `W262350001` with its three
component cards — Red blood cells, Plasma, Platelets — each with its own derived state
(three cards, AT-3). The timeline entries are driven purely by VERIFIED lifecycle events:

| Timeline visible | Entries |
| --- | --- |
| Pre-transfusion (after linking) | Donation collected · Processing started · Screening completed · Components created/available ×3 |
| Post-transfusion (additional, RBC card) | Transferred to City General Hospital (city tier max) · Received · Transfused |

**Notifications** respect privacy defaults (AT-7, PI-11). With default preferences the
in-app/email copy is generic:

> Title: "There's an update on your blood donation."
> Body: "Open the app to view its journey."

The two notifications created by the journey above are `notify.component.prepared` and
`notify.component.transfused.context`, both stored with `genericTitle = true`. Descriptive
bodies ("One of your blood components was successfully transfused.") require the donor's
explicit descriptive-content opt-in.

**Verified impact block** (BROAD_PURPOSE + EMERGENCY_CARE). Because the hospital recorded
verified consent for broad-purpose disclosure, the deterministic engine grants
`BROAD_PURPOSE` and the dashboard renders the sentence from `privacy.transfusedBroadPrefix`:

> Your Red blood cells donation supported emergency care.

Underneath it, the provenance line (PI-5) binds the claim to its verified chain. For the
run above, `DisclosureDecision.provenanceJson` contains:

```json
{
  "chain": ["DisclosureDecision", "LifecycleEvent", "Organization"],
  "organizationName": "City General Hospital",
  "sourceSystem": "hospital-7862223e",
  "sourceEventId": "component_transfused:<component uuid>:<event uuid>"
}
```

rendered as: *Verified by City General Hospital · source hospital-7862223e · event
`component_transfused:…`*. If the backing event were PENDING, the block would render
"Status awaiting verification." instead of a fact (PI-6); REJECTED events never render.

The recipient appears nowhere: hospitals submit only an opaque `recipient_ref`
(format `anon-ref-` + 10 hex characters) plus whitelisted coarse fields — there is no
name, MRN, phone, exact age, or exact time anywhere in the donor view (PI-1, AT-9).

## Privacy checkpoints

| Checkpoint | Invariant (docs/privacy-invariants.md) | Acceptance (docs/acceptance-tests.md) | Evidence in this flow |
| --- | --- | --- | --- |
| `recipient_ref` never rendered/stored as identity | PI-1 | AT-6, AT-9 | RecipientContext holds opaque ref only; donor view shows no recipient fields |
| Disclosure ceiling respected | PI-2 | AT-6 | Granted BROAD_PURPOSE ≤ recorded consent level |
| Fail-closed disclosure | PI-3 | AT-6 | Unknown/unapproved category degrades to LEVEL 0 generic message |
| Degraded cohort message | PI-4 | AT-6 | LIMITED_ANON below k=5 renders degraded copy with `degradedReason` recorded (this run: BROAD_PURPOSE needs no cohort; `degradedReason` null) |
| Provenance line present | PI-5 | AT-5 | `provenanceJson` chain rendered under impact block |
| Verified-only facts | PI-6 | AT-13 | All journey events VERIFIED; PENDING renders "awaiting verification" |
| Idempotent ingestion | PI-7 | AT-4 | `(sourceSystem, sourceEventId)` unique; replays create no duplicates |
| Immutable history | PI-8 | AT-10 | LifecycleEvent append-only; corrections are new events |
| Tenant isolation | PI-9 | AT-9 | Transfer authorized only because destination code CGH-MAIN matches; cross-org access denied |
| Data minimization | PI-10 | AT-2 | Opaque single-use link code; UUIDs only in URLs |
| Generic notifications | PI-11 | AT-7 | Both notifications `genericTitle=true`; lock-screen-safe copy |
| Aggregate suppression | PI-12 | AT-11 | Public stats suppressed below MIN_AGGREGATE=10 |
| Deterministic decisions | PI-13 | AT-5, AT-6 | Pure engine functions; no AI in disclosure paths |
| Full journey end-to-end | — | AT-5 | Audit rows exist per operation: `event.ingested`×12, `donation.linked`, `disclosure.generated`, `notification.dispatched`×2, `integration.credential.created`×2 |
| Demo without credentials | — | AT-12 | This document; everything SYNTHETIC-labelled |

## Reset

```powershell
Remove-Item src\packages\database\dev.db   # delete the SQLite dev database
npx prisma db push --skip-generate         # recreate empty schema
npm run seed                               # re-seed the synthetic demo world
```

Then `npm run simulate` again for a fresh journey.
