# BRIEF: Documentation agent

Working dir: C:\Users\arsat\OneDrive\Desktop\blood (Windows, PowerShell).

FIRST read: docs/problem-analysis.md, docs/architecture.md, docs/threat-model.md,
docs/privacy-invariants.md, docs/acceptance-tests.md, CONTRACTS.md, src/packages/database/schema.prisma,
src/packages/schemas/events.ts, src/packages/schemas/ingestion.ts, src/lib/crypto.ts (signed request
section), package.json.

## Exclusive ownership
- README.md (overwrite the stub if present)
- docs/integration-guide.md, docs/deployment.md, docs/privacy-model.md, docs/contributing.md
- CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, LICENSE
- Do NOT touch docs/demo-flow.md (built later), docs/briefs/**, or any code.

## Deliverables
1. LICENSE — Apache License 2.0 full text. In README explain choice: permissive + explicit patent
   grant maximizes adoption by hospitals/NGOs/universities while retaining attribution; compatible
   with commercial self-hosting so blood banks never face licensing friction.
2. README.md — project one-liner; what it IS / what it is explicitly NOT (spec §50 list); feature
   overview w/ ASCII journey diagram; quickstart (prereqs Node 20+/Docker optional;
   `npm install`; `npm run db:push` (sqlite default) OR docker compose up postgres +
   `npm run db:use:postgres`; `npm run seed` (wave-2 deliverable — document as the demo command);
   `npm run dev`); demo accounts table (donor@demo.raktsetu.org etc. — state seed defines exact
   passwords, mark placeholders clearly); test commands; repo map; docs index; security reporting
   pointer to SECURITY.md; prominent disclaimer box: real production deployment requires licensed
   blood centres/hospitals plus legal, clinical, security and regulatory review — this software is a
   transparency layer, not a medical device, and code alone does not establish DPDP/GDPR compliance.
3. docs/integration-guide.md — partner onboarding: credential model (keyId + shared secret,
   AES-GCM at rest), signed request spec with exact header names X-RaktSetu-Key/-Timestamp/
   -Signature, canonical string `${timestamp}.${rawBody}`, HMAC-SHA256 hex, ±300s window, rate
   limits; full payload reference for POST /api/v1/events (InboundEventSchema field-by-field table:
   external_event_id required idempotency key; donation_identifier/component_identifier +
   identifier_scheme resolution rules incl INTERNAL_UUID/DIN/FACILITY_BARCODE/ERAKTKOSH_ID/HOSPITAL_LOCAL;
   event_type catalog table w/ which lifecycle stage emits it; metadata whitelist note that
   name/mrn/aadhaar/phone/email/address/diagnosis keys are stripped server-side; disclosure block
   semantics NONE/BROAD_PURPOSE/LIMITED_ANON + patient_consent_verified requirement + recipient_ref
   being an opaque random token the HOSPITAL generates, never a real MRN); response codes table
   202/200-duplicate/401/403/409/422/429; correction events (EVENT_CORRECTION +
   correction_of_source_event_id); destination_facility_code convention for transfers (Facility.externalCode);
   webhook replay-protection guidance; adapter interface excerpt + how to write a new adapter
   (MockBloodBankAdapter as reference), ABDM/FHIR pathway section explaining future FHIR R4 adapter
   mapping (consent artefacts → DisclosureConsent; Procedure → COMPONENT_TRANSFUSED) WITHOUT
   claiming any verified integration exists.
4. docs/deployment.md — local dev (sqlite fallback) vs production (docker-compose: app+postgres16,
   env vars table incl APP_SECRET generation, DATABASE_URL, PRIVACY_MIN_COHORT/AGGREGATE,
   SESSION_TTL_DAYS, REPLAY_WINDOW_SECONDS, DEMO_MODE=false in prod!); TLS termination notes
   (reverse proxy/Caddy example snippet), backup/restore (pg_dump), migrations workflow
   (prisma migrate), logging posture (no PHI in logs), Redis-backed rate limiting swap note,
   retention policy config guidance, upgrade path.
5. docs/privacy-model.md — plain-language + precise: data minimization inventory (what we store per
   actor), recipient pseudonymity (recipientRef), consent levels w/ examples of rendered copy per
   level, re-id protection rules (age bands fixed set, category whitelist, k>=PRIVACY_MIN_COHORT,
   day granularity), fail-closed matrix, donor rights (export, deletion request, consent withdrawal)
   mapping to platform features, DPDP principles mapping table, explicit non-compliance disclaimer.
6. docs/contributing.md → root CONTRIBUTING.md — dev setup, branch naming, conventional commits,
   test requirements (invariants tests mandatory for privacy-touching changes), PR checklist incl
   "does this reveal more than before?" privacy review question, code style (strict TS, no any).
7. CODE_OF_CONDUCT.md — Contributor Covenant v2.1 text (standard).
8. SECURITY.md — supported versions, how to report privately (security.txt style email placeholder
   + GitHub private vulnerability reporting), scope (what's in/out), SLA expectations, PGP note
   optional, disclosure policy 90 days.
Tone: professional, concise, no marketing fluff. All commands must be PowerShell-safe where Windows
relevant. Never fabricate URLs (use relative links inside repo; for external standards cite names
not deep links unless certain e.g. https://www.apache.org/licenses/LICENSE-2.0.txt is fine).

## Verification gate
All files exist, markdown lint-clean by eye, cross-references between docs consistent
(file names match). Report file list + word counts approx.
