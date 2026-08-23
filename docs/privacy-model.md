# Privacy Model

What RaktSetu stores, what it deliberately never stores, and what a donor can ever be shown about the use of their blood. This document is plain-language first; the machine-enforced version of every claim here lives in docs/privacy-invariants.md (PI-1..PI-13) with automated tests.

> **Non-compliance disclaimer:** this document describes design intent, not a legal determination. Code alone does not establish DPDP 2023, GDPR or any other regime's compliance — each production deployment requires legal review of consent flows, notices and retention defaults in its jurisdiction.

## 1. Data minimization inventory

Per actor, everything the database can hold:

| Actor / record | What is stored | What is deliberately absent |
| --- | --- | --- |
| Donor account (`User`) | Email, display name, scrypt password hash, role, status | No real name required beyond display name; no phone at signup |
| Donor profile (`DonorProfile`) | Optional blood group, birth year, optional phone (only for opted-in notifications), locale | No address, no government ID, no photo |
| Donation (`Donation`) | Org + external donation id, optional DIN, date, link status/code | No donation circumstances beyond what the blood bank already records |
| Component (`BloodComponent`) | Type, timestamps derived from events | Nothing clinical |
| Lifecycle event (`LifecycleEvent`) | Event type, ids, occurred/received timestamps, source provenance, sanitized metadata | No free-text clinical notes; metadata keys like name/MRN/Aadhaar/phone/email/address/diagnosis are stripped server-side before persistence |
| Recipient context (`RecipientContext`) | Opaque `recipientRef`, coarse age band, whitelisted category | **No identity of any kind** |
| Consent (`DisclosureConsent`, `ConsentRecord`) | Level, category, policy version, verification/expiry/revocation timestamps, digest of consent text shown | No patient identity |
| Audit log (`AuditLog`) | Actor type/id, action code, resource type/id, hashed IP, timestamps | No payloads beyond identifiers |

Donor signup requires only email + display name; everything else is opt-in. QR/barcode payloads contain opaque internal UUIDs only.

## 2. Recipient pseudonymity (`recipient_ref`)

The hospital generates an **opaque random token** (8–64 chars, `[A-Za-z0-9_-]`) per recipient-context and sends it only inside the disclosure block of a `COMPONENT_TRANSFUSED` event. It must never be a real MRN, encounter number, or anything derivable from identity. The mapping between that token and the actual patient exists solely inside the hospital's own systems — RaktSetu cannot reverse it because it never receives the inputs needed to do so.

Consequence: even a full database compromise does not leak recipient identities through RaktSetu, because they are not present.

## 3. Consent levels and exactly what donors see

The hospital records one of three disclosure ceilings per transfusion context. The privacy engine renders donor copy from fixed i18n templates — never composed free text:

| Level | Recorded meaning | Exact rendered copy (English template) |
| --- | --- | --- |
| `NONE` | Patient consented to nothing beyond the fact of transfusion | "Your donation was successfully transfused." |
| `BROAD_PURPOSE` | Broad purpose category only | "Your Red blood cells donation supported emergency care." |
| `LIMITED_ANON` | Category plus coarse age band, only if cohort large enough | "Your donation supported the treatment of a patient receiving cancer care (18-40 age band)." |

Special states:

| Situation | Rendered copy |
| --- | --- |
| Component expired / discarded / recalled / returned | "This component was not transfused and has completed its blood-bank lifecycle. Thank you for donating — blood banks must maintain appropriate inventory even when every unit is not used." (neutral, non-shaming) |
| Transfusion event still `PENDING` verification | "Status awaiting verification." |
| Integration outage / engine error | "Latest status temporarily unavailable." — never invented negative facts |

Notification defaults: lock-screen titles are always generic ("There's an update on your blood donation."); descriptive bodies require explicit donor opt-in **and** a policy level that permits content.

## 4. Re-identification protection rules

Goal: prevent reconstructing *who* received blood from "anonymous" details (rare condition + age + place + time).

1. **Fixed coarse age bands only:** `<18`, `18-40`, `40-60`, `60+`. Exact ages are never accepted.
2. **Whitelisted categories only:** seven broad codes (e.g. `EMERGENCY_CARE`, `CANCER_CARE`). Unknown strings fail closed rather than render.
3. **k-anonymity floor:** `LIMITED_ANON` renders only if the (category × age band × window) cohort has ≥ `PRIVACY_MIN_COHORT` (default 5) similar events; otherwise degrade to `BROAD_PURPOSE`.
4. **Time granularity:** day-level at most, everywhere donor-visible or public.
5. **Facility granularity:** at most city-tier labels, and only above aggregate thresholds; public stats suppress anything below state tier and below `PRIVACY_MIN_AGGREGATE` (default 10).
6. **Never combine narrow attributes**; degradation reasons are recorded on every decision.

## 5. Fail-closed decision matrix

Every abnormal path degrades to less disclosure — never more:

| Condition | Granted level | Degradation reason recorded |
| --- | --- | --- |
| Event not a verified transfusion | generic statement / suppressed | `NOT_TRANSFUSION` |
| Event `PENDING`/`REJECTED` | awaiting-verification copy | `EVENT_NOT_VERIFIED` |
| No consent record | generic | — |
| Consent recorded but patient consent unverified | generic | `PATIENT_CONSENT_UNVERIFIED` |
| Consent expired | generic | `CONSENT_EXPIRED` |
| Category unknown/outside whitelist | generic | `CATEGORY_UNKNOWN` |
| Age band missing/unknown at LIMITED_ANON | BROAD_PURPOSE | `AGE_BAND_MISSING` |
| Cohort below k floor | BROAD_PURPOSE | `COHORT_TOO_SMALL` |

Unknown consent equals `NONE`. The disclosed level can never exceed the recorded ceiling (consent-ceiling invariant). Decisions are pure deterministic functions — no AI participates anywhere in these paths.

## 6. Donor rights → platform features

| Right | Where it lives |
| --- | --- |
| **Access / export** | Donor-facing export of their own data (consent-gated under purpose key `data.export`); all donation/component/event data the platform holds about them. |
| **Correction** | Clinical facts are corrected by the source organization via `EVENT_CORRECTION` events — history stays auditable rather than silently rewritten. Profile fields are editable by the donor. |
| **Withdrawal of consent** | Notification preferences toggle channels off instantly; descriptive-content opt-out reverts bodies to generic; recipient-side consent revocation sets `revokedAt` and fails closed thereafter. |
| **Deletion request** | Account deletion cascades profile, sessions, preferences; donations de-link from the donor while organization-side lifecycle facts remain as anonymized provenance. Operators configure retention windows per §7 of docs/deployment.md. |
| **Grievance / redressal** | Hooked as consent/purpose records and operator contact points; deployments must publish their grievance channel in the privacy notice. |

## 7. DPDP Act 2023 principles mapping

Design constraints baked in (mapping, not legal opinion):

| Principle | How RaktSetu implements it |
| --- | --- |
| Purpose limitation | Every consent row carries purpose key + policy version; disclosures bounded by recorded level. |
| Data minimization | §1 inventory; strict zod schemas; server-side metadata stripping. |
| Consent notice & records | Versioned consent records incl. digest of the exact text shown; unverified consent renders nothing extra. |
| Withdrawal | First-class revocation flags honored deterministically on every decision. |
| Storage limitation | Expiries on consents/sessions/tokens; operator-configurable retention (docs/deployment.md §7). |
| Accuracy | Verified-only facts (PI-6) + auditable correction events instead of silent edits. |
| Security safeguards | HMAC-signed ingestion, AES-GCM secrets at rest, RBAC deny-by-default, tenant isolation, append-only audit. |
| Rights (access/correction/deletion) | §6 mapping above. |
| Accountability | Immutable audit log for every sensitive action; provenance chains on all donor-visible claims. |

## 8. What we explicitly do not claim

- That running this software makes any deployment compliant with DPDP/GDPR or health regulations — it does not.
- That hospital-recorded consent was lawfully obtained — the platform verifies nothing beyond the flag your integration sends; `patient_consent_verified=true` must mean what it says under your own legal process.
- That residual risk is zero: re-identification is a statistical threat; the floors above reduce it and fail closed, but deployment-specific review remains mandatory (see docs/threat-model.md, residual risks).
