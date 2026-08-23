# Privacy Invariants (machine-enforced)

Every invariant has an automated test in `tests/unit/privacy/` or `tests/unit/security/`.
The build fails if any is violated. Privacy rules always override engagement features.

## PI-1 No recipient identity
No donor-visible response, notification, export, log line, or audit metadata contains:
name, MRN/encounter IDs, Aadhaar, phone, email, exact address, bed/ward, precise timestamp
of clinical care, or free-text clinical notes. RecipientContext stores only an opaque
`recipientRef` plus coarse fields explicitly whitelisted by the disclosure engine.

## PI-2 Consent ceiling
Disclosed level ≤ recorded DisclosureConsent.level. Always. Unknown consent = NONE.
A recipient's context can never exceed what the receiving hospital recorded and the patient
consented to.

## PI-3 Fail-closed disclosure
Unknown category, unverified event, expired consent, missing provenance, or engine error ⇒
degrade to LEVEL 0 ("Your donation was transfused.") or suppress entirely. Never guess.

## PI-4 Re-identification floor (k-anonymity guard)
LIMITED_ANON context renders only if the (category × ageBand × facility-cohort) combination has
≥ `PRIVACY_MIN_COHORT` (default 5) similar events in the aggregation window; otherwise degrade.
Age bands are fixed: `<18`, `18-40`, `40-60`, `60+`. Facility shown at most at city tier and only
when cohort ≥ threshold. Time generalized to date. Never combine narrow attributes.

## PI-5 Provenance binding
Every donor-facing claim string carries a provenance chain: rendered message → DisclosureDecision
→ LifecycleEvent(VERIFIED) → Organization → sourceSystem + sourceEventId. Unverifiable claims are
not displayed.

## PI-6 Verified-only facts
Donor-visible state transitions may derive only from events with verificationStatus=VERIFIED.
PENDING events render as "awaiting verification"; REJECTED events never render.

## PI-7 Idempotent truth
(sourceSystem, sourceEventId) is globally unique. Replays never duplicate facts, notifications,
or impact counters.

## PI-8 Immutable history
LifecycleEvent rows are append-only. Corrections create EVENT_CORRECTION events referencing the
superseded event. No UPDATE/DELETE path exists in code for clinical payloads.

## PI-9 Tenant isolation
Every query touching donations/components/events is scoped by organization membership or donor
ownership. Deny-by-default helpers; no raw unscoped queries in route handlers.

## PI-10 Data minimization
Donor signup requires only email + display name. Optional profile fields are opt-in. QR/barcode
payloads contain opaque internal UUIDs only — never names, phones, DINs of other parties, or
predictable sequential DB ids in URLs for cross-tenant objects.

## PI-11 Notification privacy default
Out-of-band channel bodies are generic unless donor opted into descriptive content AND policy
level permits; titles are always generic.

## PI-12 Aggregate suppression
Public stats with underlying cohort < PRIVACY_MIN_AGGREGATE (default 10) are suppressed or merged;
no region below state tier; nothing time-granular beyond day.

## PI-13 Deterministic decisions
Disclosure, authorization, traceability and consent enforcement are pure deterministic functions.
No LLM/AI participates in these paths (spec §33).
