# BRIEF: Integrations + domain services agent

Working dir: C:\Users\arsat\OneDrive\Desktop\blood (Windows, PowerShell).

FIRST read completely: CONTRACTS.md, docs/architecture.md, src/packages/schemas/events.ts,
src/packages/schemas/ingestion.ts, src/lib/services/ingest.ts, src/lib/crypto.ts, src/lib/api.ts,
src/packages/database/schema.prisma, src/i18n/messages/en.ts. Do NOT modify schema.prisma.

## Exclusive ownership (touch nothing else)
- src/packages/integrations/** (new)
- src/app/api/v1/** (new)
- src/lib/services/provisioning.ts, bloodbank-ops.ts, hospital-ops.ts, simulator.ts (new)
- tests/unit/domain/**, tests/unit/security/webhook-signature.test.ts, tests/integration/journey-core.test.ts (new)
- May ADD keys under `staff:` namespace only in src/i18n/messages/en.ts (re-read before editing; others edit concurrently).

## Already built for you (reuse, never reimplement)
- ingestEvent(event: InboundEvent, ctx: IngestContext) in src/lib/services/ingest.ts = THE single
  ingestion path (idempotency, tenant authz via IngestAuthzError / UnresolvableIdentifierError,
  append-only events, derived state refresh, disclosure decisions, donor notifications, audit).
- verifySignedRequest(rawBody, headers, resolveSecret) in lib/crypto — HMAC over `${ts}.${body}`,
  headers X-RaktSetu-Key / -Timestamp / -Signature; encryptSecret/decryptSecret AES-GCM;
  randomToken(); prisma singleton at "@/packages/database/client"; rateLimit(key,limit,windowMs).

## Build
1. `src/packages/integrations/adapter.ts`:
```ts
export class AdapterError extends Error {}
export interface NormalizedEvent { external_event_id: string; event_type: EventType; occurred_at: Date; payload?: Record<string, unknown>; }
export interface ComponentSnapshot { externalComponentId: string; componentType: ComponentType; }
export interface DonationSnapshot { externalDonationId: string; din: string | null; donatedAt: Date; components: ComponentSnapshot[]; }
export interface BloodSystemAdapter {
  readonly id: string;
  readonly kind: "BLOOD_BANK" | "HOSPITAL";
  getDonation(ref: string): Promise<DonationSnapshot | null>;
  getComponents(donationRef: string): Promise<ComponentSnapshot[]>;
  getLifecycleEvents(ref: string): Promise<NormalizedEvent[]>;
  verifyIdentifier(id: string): Promise<boolean>;
  normalizeEvent(raw: unknown): NormalizedEvent;
}
```
2. `mock-blood-bank.ts` + `mock-hospital.ts`: deterministic in-memory adapters over an injected
   store object; ISBT-style DIN generator (`W` + yy + day-of-year + serial); normalize raw dicts
   (accept keys like type/event/id/time) → NormalizedEvent or throw AdapterError. No network.
3. `src/lib/services/provisioning.ts`: createIntegrationWithCredential(orgId, name, adapterType,
   description?) → Integration + credential (keyId `rk_<randomToken(8)>`, secret randomToken(32)
   stored encryptSecret-ed; plaintext returned ONCE); rotateCredential(credentialId) → new key/secret,
   old REVOKED rotatedAt set, audit "integration.credential.rotated"; revokeCredential(...) audit.
4. `src/lib/services/bloodbank-ops.ts` — staff/demo ops building InboundEvents then calling
   ingestEvent() (ctx sourceSystem `<orgslug>-ops`, orgKind "BLOOD_BANK", ingestedByUserId):
   - recordDonation({organizationId, externalDonationId, din?, donatedAt, facilityCode?}): create
     Donation (UNLINKED, default cuid linkCode) + ExternalIdentifier(scheme FACILITY_BARCODE,
     value=externalDonationId), then DONATION_COLLECTED. Return {donationId, linkCode}.
   - completeProcessing(...): DONATION_PROCESSING_STARTED + SCREENING_COMPLETED.
   - createComponents({donationId, organizationId, components:[{componentType, externalComponentId}]}):
     create BloodComponent rows + ExternalIdentifier(FACILITY_BARCODE, value=externalComponentId,
     entityType COMPONENT) FIRST so ingest resolves them, then COMPONENT_CREATED per component.
     Return component ids.
   - transferComponent({componentId, organizationId, destinationFacilityExternalCode}):
     COMPONENT_TRANSFERRED with metadata {destination_facility_code}.
   - markComponentExpired / markComponentDiscarded helpers.
5. `src/lib/services/hospital-ops.ts`: receiveComponent, issueComponent, returnComponent,
   discardComponent, transfuseComponent({componentId, organizationId, disclosure:{level, category?,
   age_band?, recipient_ref, patient_consent_verified}}) — disclosure goes into the InboundEvent
   disclosure block. ctx sourceSystem `hospital-<orgId slice 0..8>`, fetch org kind from DB.
6. `src/lib/services/simulator.ts`: DEMO_MODE-gated facade. Demo org names fixed for seed parity:
   blood bank "Seva Blood Centre" (kind BLOOD_BANK), hospital "City General Hospital" (kind
   HOSPITAL). Lazy lookup w/ clear error if absent. simulateFullJourney(): record donation for an
   optional donor email (link via prisma.donation.update donorProfileId when found), process/screen,
   create RBC+PLASMA+PLATELET, transfer RBC (destination facility code must match hospital's
   Facility.externalCode e.g. "CGH-MAIN"), receive, transfuse RBC w/ BROAD_PURPOSE+EMERGENCY_CARE.
   Also expose individual step fns for staff UI (wave 2). Returned objects carry label strings
   marked "(synthetic demo)". Use mock adapters to produce plausible DINs where handy.
7. `src/app/api/v1/events/route.ts` POST:
   - rateLimit(`api:${keyId}`,120,60_000) → 429 RATE_LIMITED envelope on miss.
   - raw text body; resolveSecret: credential by keyId status ACTIVE → integration ACTIVE → org
     ACTIVE → decryptSecret. Map SignatureCheck.reason MISSING_HEADERS/BAD_TIMESTAMP/BAD_SIGNATURE/
     UNKNOWN_KEY/REVOKED_KEY → 401 UNAUTHORIZED generic. Log IntegrationEvent disposition
     UNAUTHORIZED with bodySha256 + reason code ONLY.
   - zod parse → 422 VALIDATION_ERROR (log INVALID).
   - IngestContext from integration row (org kind included). Call ingestEvent:
     ACCEPTED→202 {status:"accepted", event_id}; DUPLICATE→200 {status:"duplicate", duplicate_of};
     UnresolvableIdentifierError→409 CONFLICT generic; IngestAuthzError→403 FORBIDDEN generic;
     log every attempt as IntegrationEvent (ACCEPTED/DUPLICATE/ERROR + lifecycleEventId).
   - GET → 405 JSON envelope. Never log secrets/payload contents.

## Tests (vitest, node)
- tests/unit/domain/derive.test.ts — pure deriveComponentState: happy chain CREATED→AVAILABLE→
  TRANSFERRED→RECEIVED→ISSUED→TRANSFUSED; PENDING never advances state (awaitingVerification true);
  REJECTED ignored; correction supersedes target; event-after-terminal flags; out-of-order flag;
  transfusion directly after RESERVED allowed; RETURNED maps back to RECEIVED.
- tests/unit/domain/idempotency.test.ts — direct ingestEvent twice (build minimal donation+component
  rows in a throwaway sqlite db) → DUPLICATE, 1 row, no dup notifications.
- tests/unit/security/webhook-signature.test.ts — pure crypto paths incl tamper/stale/wrong-secret.
- tests/integration/journey-core.test.ts — end-to-end through services: two orgs + facilities
  (hospital facility externalCode "CGH-MAIN"), provisioning credentials both sides, register donor+
  profile, recordDonation→link→3 components→transfer→receive→transfuse(BROAD_PURPOSE/EMERGENCY_CARE,
  recipient_ref "anon-ref-0001", patient_consent_verified true). Assert: component state TRANSFUSED;
  DisclosureDecision grantedLevel BROAD_PURPOSE w/ provenanceJson chain fields; Notification exists
  for donor; AuditLog has event.ingested; negative: hospital credential path against unrelated BB's
  component throws IngestAuthzError. Test DB: top-of-file process.env.DATABASE_URL="file:./test-journey.db"
  BEFORE dynamic-importing prisma; beforeAll execSync `npx prisma db push --skip-generate` w/ env;
  afterAll best-effort deleteMany created rows + rm db file.

## Verification gate (must pass before you finish)
1. npx tsc --noEmit → exit 0
2. npx vitest run tests/unit/domain tests/unit/security/webhook-signature.test.ts tests/integration/journey-core.test.ts → all green
Report files created, test results, deviations w/ reasons.
