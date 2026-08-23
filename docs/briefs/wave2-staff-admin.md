# BRIEF: Staff + Admin portals (Wave 2)

Working dir: C:\Users\arsat\OneDrive\Desktop\blood (Windows, PowerShell).
FIRST read completely: CONTRACTS.md, src/lib/services/bloodbank-ops.ts, hospital-ops.ts,
provisioning.ts, simulator.ts, ingest.ts (only the exported types), src/lib/rbac.ts,
src/lib/auth/session.ts, src/packages/ui/index.ts, src/i18n/messages/en.ts (existing `staff:` keys),
docs/integration-guide.md (credential handling section only).

## Exclusive ownership (touch NOTHING else)
- src/app/staff/** , src/app/admin/**
- May ADD keys under `staff:` and `admin:` namespaces ONLY in src/i18n/messages/en.ts
  (concurrent edits by other agents: re-read right before each edit, append-only).

## Hard rules
- Every server action: requireRole(...) + requireOrgMember(orgId) where an org is involved;
  deny-by-default. Ops services authorize again inside ingestEvent (defense in depth) but the UI
  layer must still gate.
- Never display credential secrets after the single provisioning/rotation response; show full
  plaintext once with a copy button + explicit warning, then only keyId + status.
- Simulator UI gated by BOTH can(role,"simulator:use") AND process.env.DEMO_MODE === "true";
  hide entirely otherwise.
- Errors: catch OpsValidationError/OpsNotFoundError/HospitalOpsNotFoundError/IngestAuthzError/
  UnresolvableIdentifierError and map to friendly i18n messages; IngestAuthzError must read as
  "not authorized to act on this unit".

## Build
1. `/staff` layout + landing: requireRole("ORG_STAFF","ORG_ADMIN","PLATFORM_ADMIN"). List the
   user's ACTIVE OrganizationUser memberships (PLATFORM_ADMIN sees all orgs); selecting an org
   persists via searchParams ?org=. Show two panels per org kind: BLOOD_BANK -> blood-bank ops,
   HOSPITAL -> hospital ops; org kind BLOOD_BANK_AND_HOSPITAL gets both.
2. Blood-bank ops panel (org kind BLOOD_BANK/*):
   - Record donation: externalDonationId, din optional, donatedAt datetime-local, facilityCode
     select (org facilities) -> recordDonation; show returned linkCode prominently (copyable).
   - Complete processing: pick UNLINKED-or-any donation -> completeProcessing.
   - Create components: donation select + repeatable rows {componentType select (RBC/PLASMA/
     PLATELET and any other enum values from events.ts COMPONENT_TYPES), externalComponentId}
     -> createComponents.
   - Transfer: component select (org components w/ state AVAILABLE/RESERVED) +
     destinationFacilityExternalCode text -> transferComponent.
   - Expired/Discarded helpers -> markComponentExpired/markComponentDiscarded if exported
     (check actual names in bloodbank-ops.ts; if named differently use those).
3. Hospital ops panel: component picker scoped to components whose currentDerivedState is
   RECEIVED/ISSUED/RESERVED/AVAILABLE; actions receive/issue/return/discard; transfuse opens a
   disclosure sub-form: level select (NONE/BROAD_PURPOSE/LIMITED_ANON), category select from
   TREATMENT_CATEGORIES (required unless NONE), age_band optional, recipient_ref text
   (placeholder showing the anon-ref format, label "opaque local reference - never a name/ID"),
   patient_consent_verified checkbox required for BROAD_PURPOSE. Calls transfuseComponent etc.
4. Recent activity table per org: last 20 LifecycleEvents (eventType, occurredAt, sourceSystem,
   verificationStatus) - read-only.
5. `/admin`: requireRole("ORG_ADMIN","PLATFORM_ADMIN").
   - Integrations: list org Integrations + credentials (keyId, status, rotatedAt, lastUsedAt);
     create (adapterType select MOCK_BLOOD_BANK/MOCK_HOSPITAL + future types from schema),
     rotate, revoke via provisioning.ts fns; plaintext shown-once pattern above.
   - Audit viewer (permission audit:read:own-org / audit:read:any): filterable table of AuditLog
     (action, actorType, resourceType, createdAt); no payloads containing identifiers beyond
     resourceId.
6. `/admin/platform` (PLATFORM_ADMIN only): org list w/ status, user count; activate/deactivate
   org (org:manage). Keep minimal.
7. Simulator panel (DEMO_MODE + permission gated): buttons driving simulator.ts individual step
   fns (simulateRecordDonation w/ optional donorEmail, simulateProcessing, simulateComponents,
   simulateTransferToHospital, simulateReceiveAtHospital, simulateTransfusion) and a Run full
   journey button (simulateFullJourney); render returned labels/steps as a checklist result.

## Verification gate (must pass before finishing)
1. npx tsc --noEmit -> exit 0
2. npx next build -> success
3. npx vitest run -> all pre-existing tests still pass
Report files created, deviations w/ reasons.
