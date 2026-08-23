# BRIEF: Seed + simulator CLI + demo-flow evidence (Wave 2)

Working dir: C:\Users\arsat\OneDrive\Desktop\blood (Windows, PowerShell).
FIRST read completely: CONTRACTS.md, src/lib/services/simulator.ts, provisioning.ts, account.ts,
src/packages/database/schema.prisma, docs/acceptance-tests.md (esp. the journey AT),
docs/demo-flow.md does NOT exist yet - you create it.

## Exclusive ownership (touch NOTHING else)
- scripts/seed.ts , scripts/simulate.ts , docs/demo-flow.md
- NO edits to src/** or en.ts. If a service bug blocks you, STOP that step and report it.

## Build
1. scripts/seed.ts — idempotent demo seed, DEMO_MODE-gated (refuse to run when
   process.env.DEMO_MODE !== "true" unless --force). Uses prisma from @/packages/database/client.
   Upsert by natural keys:
   - Org "Seva Blood Centre" kind BLOOD_BANK status ACTIVE + Facility { name "Main Lab",
     code "SBC-LAB", kind PROCESSING_LAB }.
   - Org "City General Hospital" kind HOSPITAL status ACTIVE + Facility { name "Main Campus",
     code "MAIN", externalCode "CGH-MAIN", kind HOSPITAL }.
   - Users (password via the same hashing used in account.ts — import its hash fn if exported,
     else replicate with lib/auth/passwords): admin@demo.local PLATFORM_ADMIN;
     bb-staff@demo.local ORG_STAFF + ACTIVE OrganizationUser(Seva Blood Centre, ORG_ADMIN);
     hosp-staff@demo.local ORG_STAFF + OrganizationUser(City General Hospital, ORG_ADMIN);
     donor@demo.local DONOR + DonorProfile bloodGroup "O+" + default NotificationPreference.
   - One Integration per demo org via createIntegrationWithCredential; print keyId + plaintext
     secret ONCE to stdout with a warning (dev only).
   - Console summary table at end. Exit 0.
2. scripts/simulate.ts — CLI wrapper: DEMO_MODE gate same as seed; optional --donor-email flag
   (default donor@demo.local); calls simulateFullJourney({ donorEmail }); prints each step label,
   final component states, disclosure grantedLevel and notification count as a checklist;
   non-zero exit on any thrown error. Keep output copy-pasteable for docs.
3. docs/demo-flow.md — evidence walkthrough:
   - Prereqs: Node 24, npm ci, .env defaults (DEMO_MODE=true, sqlite DATABASE_URL).
   - Exact commands: npx prisma generate -> npm run db:use:sqlite -> npm run seed -> npm run
     simulate (note dev server not required for CLI journey).
   - Expected output excerpts for each step (from YOUR actual run - paste real output).
   - Donor-perspective section: sign in as donor@demo.local, what /dashboard shows after link,
     which timeline entries are visible pre/post transfusion, generic notification copy, verified
     impact block w/ BROAD_PURPOSE + EMERGENCY_CARE and provenance line.
   - Privacy checkpoints table mapping to docs/privacy-invariants.md PI ids and acceptance-tests
     AT ids (e.g., recipient_ref never rendered; degraded cohort message; audit rows present).
   - Reset instructions (delete dev.db + re-seed).

## Verification gate (must pass before finishing)
1. npx tsc --noEmit -> exit 0 (scripts included in tsconfig)
2. npm run seed then npm run simulate succeed against src/packages/database/dev.db; paste the
   tail of both outputs into your report.
3. npx vitest run still all green.
Report files created + pasted outputs + deviations.
