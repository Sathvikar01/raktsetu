# BRIEF: Privacy view layer + tests agent

Working dir: C:\Users\arsat\OneDrive\Desktop\blood (Windows, PowerShell).

FIRST read: CONTRACTS.md, docs/privacy-invariants.md, src/packages/privacy/engine.ts,
src/packages/database/schema.prisma (DisclosureDecision, LifecycleEvent, RecipientContext),
src/i18n/index.ts, src/i18n/messages/en.ts, src/lib/json.ts.

## Exclusive ownership
- src/lib/services/disclosure-view.ts (new)
- tests/unit/privacy/** (new)
- May ADD keys under `privacy:` namespace only in src/i18n/messages/en.ts (re-read before editing).

## Build
1. `src/lib/services/disclosure-view.ts`:
   - renderDisclosureMessage(decisionRow, locale): resolves i18n template messageKey + paramsJson;
     params values like "{components.RBC}" are dictionary references — resolve via translate();
     plain strings pass through. Returns final donor-safe string.
   - getVerifiedDecisionForEvent(eventId): loads DisclosureDecision + joins LifecycleEvent; returns
     null unless event.verificationStatus === "VERIFIED" (PI-5/PI-6 provenance gate). Include
     provenance summary {organizationName? only coarse, sourceSystem present} for audit display —
     never recipient data.
   - getComponentDonorView(componentId): assembles per-component donor view:
     {componentType, derivedState (from BloodComponent.currentDerivedState), preparedAt, events:
     timeline [{date(occurredAt), labelKey by eventType, facilityCityTier|null}], impactMessage|null
     (rendered disclosure or lifecycleComplete copy for EXPIRED/DISCARDED/RECALLED), awaitingVerification}
     Timeline labels: map event types to existing/new privacy.* keys (add keys you need under
     privacy namespace, e.g. privacy.event.DONATION_COLLECTED etc.). Only VERIFIED events appear;
     if any PENDING exist set awaitingVerification=true.
2. Tests `tests/unit/privacy/engine.test.ts` covering every branch of decideDisclosure():
   non-transfusion → null msgKey NOT_TRANSFUSION; PENDING → awaitingVerification key; no consent →
   generic NONE; consent level BROAD w/ valid category → BROAD_PURPOSE + params contain dict refs;
   LIMITED_ANON w/ ageBand but cohort < PRIVACY_MIN_COHORT(env 5) → degraded BROAD + reason
   COHORT_TOO_SMALL; cohort >= threshold → LIMITED_ANON; patient_consent_verified false → generic +
   reason PATIENT_CONSENT_UNVERIFIED; expired consent → CONSENT_EXPIRED; unknown category string →
   CATEGORY_UNKNOWN fail-closed; missing ageBand on LIMITED → AGE_BAND_MISSING degrade.
3. Tests `tests/unit/privacy/metadata.test.ts` — sanitizeMetadata strips name/mrn/aadhaar/phone/
   email/address/diagnosis keys case-insensitively incl nested objects; keeps safe keys.
4. Tests `tests/unit/privacy/view.test.ts` — renderDisclosureMessage resolves "{components.PLASMA}"
   and "{categories.CANCER_CARE}" to English copy; getVerifiedDecisionForEvent returns null for
   PENDING/REJECTED events (create in-memory fakes w/ vi.mock of prisma OR factor the function to
   accept injected data — prefer pure inner functions exported for test + thin prisma wrapper).
   Design for testability: keep query logic thin, logic pure.

## Verification gate
1. npx tsc --noEmit → exit 0
2. npx vitest run tests/unit/privacy → all green
Report files, results, deviations.
