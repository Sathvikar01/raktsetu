# Integration Guide

How a blood bank or hospital connects its systems to RaktSetu and submits lifecycle events over the partner API. Audience: integration engineers at partner organizations and platform operators provisioning credentials.

> **Scope reminder:** RaktSetu is a transparency layer, not a medical device or system of record for clinical data. Your LIS/HIS/blood-bank management system remains the source of clinical truth; RaktSetu receives *events* about unit lifecycle only.

## 1. Credential model

Each partner organization gets one or more **integrations**, each with credentials:

| Concept | Where it lives | Notes |
| --- | --- | --- |
| `keyId` | `IntegrationCredential.keyId` (unique) | Public identifier sent as `X-RaktSetu-Key`. Not secret. |
| Shared secret | `IntegrationCredential.secretEncrypted` | High-entropy random string, issued once out-of-band. Stored **encrypted at rest with AES-256-GCM** keyed off the platform `APP_SECRET`. Never logged, never returned by any API. |
| Scopes | `IntegrationCredential.scopes` | Default `events:write` (submit lifecycle events for your own organization). |
| Status | `ACTIVE` / `REVOKED` | Revoked keys fail verification immediately (`401`). Rotation creates a new credential; old ones are revoked, not deleted, preserving audit history. |

Provisioning is performed by the platform operator out-of-band (the shared secret is delivered through a private channel, never email-in-the-clear). If you suspect compromise, request revocation first, then re-issue.

## 2. Signed requests

Every call to `POST /api/v1/events` must carry three headers:

| Header | Content |
| --- | --- |
| `X-RaktSetu-Key` | Your `keyId`. |
| `X-RaktSetu-Timestamp` | Unix epoch seconds (as sent). Must be within the replay window of server time (default ±300 seconds, configurable via `REPLAY_WINDOW_SECONDS`). |
| `X-RaktSetu-Signature` | Lowercase hex HMAC-SHA256 of the canonical string. |

The canonical string is:

```
${timestamp}.${rawBody}
```

where `${timestamp}` is the exact string you put in `X-RaktSetu-Timestamp` and `${rawBody}` is the **exact raw request body bytes** — the same serialization you signed, not a re-encoded JSON document. Any difference in whitespace or key order between signing and sending produces `401`.

Verification on the platform side: recompute HMAC-SHA256 with your credential secret, compare using a constant-time comparison, reject stale/future timestamps outside the window, reject unknown or revoked keys. Failure reasons (`MISSING_HEADERS`, `BAD_TIMESTAMP`, `BAD_SIGNATURE`, `UNKNOWN_KEY`, `REVOKED_KEY`) all map to `401`; details are logged internally, not exposed to callers.

Reference signer (Node.js):

```js
import { createHmac } from "node:crypto";

const timestamp = Math.floor(Date.now() / 1000).toString();
const rawBody = JSON.stringify(payload); // serialize ONCE, sign these exact bytes
const signature = createHmac("sha256", SECRET).update(`${timestamp}.${rawBody}`).digest("hex");

await fetch("https://<host>/api/v1/events", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-RaktSetu-Key": KEY_ID,
    "X-RaktSetu-Timestamp": timestamp,
    "X-RaktSetu-Signature": signature,
  },
  body: rawBody,
});
```

### Clock discipline

Keep your host clock synchronized (NTP). Skew beyond the window yields `401 BAD_TIMESTAMP` even when the signature is valid.

## 3. Rate limits and payload size

- Requests are rate-limited per credential key using a sliding-window limiter. Exceeding it returns `429` with a `Retry-After` hint. Numeric ceilings are provisioned per credential by the operator (not hard-coded) — ask for your allocation during onboarding.
- Request bodies are subject to payload size caps enforced at the API edge; oversized requests are rejected before validation.
- Replays of already-accepted events are cheap (idempotent short-circuit) and are the correct way to recover from uncertain network outcomes — see §8.

## 4. Endpoint: `POST /api/v1/events`

One endpoint, one purpose: submit one lifecycle event. All sources (partner HTTP integrations, the staff simulator, the demo seed) flow through the same ingestion pipeline — there is no side door.

### 4.1 Field-by-field payload reference (`InboundEventSchema`, strict)

Unknown fields are rejected (`422`) — the schema is strict to reduce tampering surface.

| Field | Type | Required | Constraints | Meaning |
| --- | --- | --- | --- | --- |
| `external_event_id` | string | **yes** | 1–128 chars | **Your idempotency key.** Globally unique per source system. Resending the same id never duplicates facts, notifications or impact counters — the API returns `200` with `status:"duplicate"`. |
| `event_type` | enum | **yes** | closed set (§5) | Lifecycle stage being reported. |
| `occurred_at` | string | **yes** | ISO 8601 datetime (RFC 3339, e.g. `2026-08-23T10:15:00Z`) | When the event happened in the real world (not when you send it). State derivation orders by this. |
| `donation_identifier` | string | conditional | 1–128 chars | Identifier resolving to a donation (see §4.2). Required for donation-level events. Must NOT be present together with component-level semantics that violate §4.3 rules. |
| `component_identifier` | string | conditional | 1–128 chars | Identifier resolving to a blood component. Component events require this **or** `donation_identifier`. Donation-level events (`DONATION_*`, `SCREENING_COMPLETED`) must NOT carry it. |
| `identifier_scheme` | enum | no (default `HOSPITAL_LOCAL`) | `INTERNAL_UUID` \| `ISBT128_DIN` \| `FACILITY_BARCODE` \| `ERAKTKOSH_ID` \| `HOSPITAL_LOCAL` | Which scheme your identifiers use (see §4.2). |
| `facility_code` | string | no | ≤64 chars | Your facility code within your organization; resolved to the internal facility record when unambiguous. |
| `verification_status` | enum | no (default `VERIFIED`) | `VERIFIED` \| `PENDING` | Submit `VERIFIED` only for facts your system stands behind. `PENDING` renders to donors as "awaiting verification". (`REJECTED` exists only internally.) |
| `metadata` | object | no | flat map of string \| number \| boolean | Sanitized allowlist-style extras (§6). Forbidden keys are stripped server-side. Also carries the `destination_facility_code` convention for transfers (§7). |
| `correction_of_source_event_id` | string | no | ≤128 chars | With `EVENT_CORRECTION`: the `external_event_id` of the event being corrected (must exist under the same source system). See §7. |
| `disclosure` | object | no | see §6.1 | Recipient-context disclosure attached to `COMPONENT_TRANSFUSED`. |

### 4.2 Identifier resolution rules

RaktSetu stores multiple external identifiers per donation/component plus its own internal UUID — it never assumes one scheme. Resolution is scoped to your organization: an identifier that resolves to another tenant's object is an authorization failure, not a match.

| Scheme | What you send | How it resolves |
| --- | --- | --- |
| `HOSPITAL_LOCAL` *(default)* | Your facility-local barcode/unit number | Matched against registered external identifiers for your org, and against donation/component records registered under your org. |
| `ISBT128_DIN` | ISBT 128 Donation Identification Number | Matched against the donation's DIN field / external identifiers. |
| `ERAKTKOSH_ID` | e-RaktKosh unit id | Matched against registered external identifiers. |
| `FACILITY_BARCODE` | Facility barcode value | Matched against registered external identifiers. |
| `INTERNAL_UUID` | RaktSetu internal UUID (e.g. from a prior response or QR payload) | Direct internal lookup, still org-scoped. |

Unresolvable identifiers return `409`. Ambiguity never guesses: if a destination facility code matches zero or multiple facilities, the event is stored `PENDING` with a resolution marker instead of being silently mis-linked (fail-safe, AT-13).

### 4.3 Structural validation rules (enforced server-side)

1. Donation-level events (`DONATION_COLLECTED`, `DONATION_PROCESSING_STARTED`, `SCREENING_COMPLETED`) must **not** carry `component_identifier`.
2. Component events (`COMPONENT_*`) require `component_identifier` **or** `donation_identifier`.
3. A `disclosure` block with `level != "NONE"` requires `category`.

Violations yield `422` with per-field issue paths.

## 5. Event type catalog

Closed set — extending it requires a PR plus documentation update. Emit the event at the lifecycle stage described:

| `event_type` | Lifecycle stage emitting it | Typical source |
| --- | --- | --- |
| `DONATION_COLLECTED` | Whole-blood collection completed | Blood bank |
| `DONATION_PROCESSING_STARTED` | Lab processing begins (separation workflow) | Blood bank |
| `SCREENING_COMPLETED` | Donor screening/TTI testing workflow completed (no results are ever transmitted — RaktSetu carries no serology data) | Blood bank |
| `COMPONENT_CREATED` | A component (RBC / Plasma / Platelet / Whole blood / Other) was prepared from the donation | Blood bank |
| `COMPONENT_AVAILABLE` | Component released to usable inventory | Blood bank |
| `COMPONENT_RESERVED` | Reserved/crossmatched for an intended issue | Blood bank / Hospital |
| `COMPONENT_TRANSFERRED` | Unit dispatched to another facility (include `destination_facility_code` metadata, §7) | Blood bank |
| `COMPONENT_RECEIVED` | Destination facility confirmed receipt | Hospital |
| `COMPONENT_ISSUED` | Issued for patient care | Hospital |
| `COMPONENT_RETURNED` | Returned unused to stock | Hospital / Blood bank |
| `COMPONENT_TRANSFUSED` | Transfusion administered. May carry the `disclosure` block (§6.1) | Hospital |
| `COMPONENT_EXPIRED` | Shelf life elapsed | Blood bank |
| `COMPONENT_DISCARDED` | Discarded (rendered neutrally to donors — never shaming copy) | Blood bank |
| `COMPONENT_RECALLED` | Recall initiated | Blood bank / Regulator workflow |
| `EVENT_CORRECTION` | Supersedes a previously submitted event (§7) | Any source |

Donor-visible state transitions derive only from `VERIFIED` events; `PENDING` events render as "awaiting verification".

## 6. Metadata and privacy sanitization

`metadata` accepts only flat string/number/boolean values. Server-side sanitization strips forbidden keys case-insensitively and punctuation-insensitively (so `MRN`, `mrn_number`, `PatientName` variants are caught). Stripped categories include:

- Personal identifiers: name, patient/recipient name, MRN / medical record number, Aadhaar, phone number, email, address
- Clinical content: diagnosis, notes, clinical notes
- Location detail: bed, ward
- Credentials: password

Stripped keys are silently dropped; the rest of the metadata persists with the event. Sending recipient-identifying data anywhere other than the whitelisted `disclosure` fields is a policy violation by your integration — design your payloads so it cannot happen.

### 6.1 Disclosure block semantics (`COMPONENT_TRANSFUSED` only)

```json
{
  "disclosure": {
    "level": "BROAD_PURPOSE",
    "category": "EMERGENCY_CARE",
    "age_band": "18-40",
    "recipient_ref": "aX93kQ2mVb7LpZ",
    "patient_consent_verified": true
  }
}
```

| Field | Rules |
| --- | --- |
| `level` | `NONE` \| `BROAD_PURPOSE` \| `LIMITED_ANON` — the ceiling of what the donor may ever see about the use of their blood. |
| `category` | Whitelisted broad category: `EMERGENCY_CARE`, `SURGERY`, `CANCER_CARE`, `MATERNAL_CARE`, `PEDIATRIC_CARE`, `CHRONIC_TREATMENT`, `OTHER_CLINICAL`. Required whenever `level != NONE`. Free-text categories are rejected — unknown strings fail closed. |
| `age_band` | Fixed set: `<18`, `18-40`, `40-60`, `60+`. Coarse bands only; used solely for the k-anonymity cohort computation. Never send exact age. |
| `recipient_ref` | **An opaque random token that YOUR hospital generates** — a random string of 8–64 characters `[A-Za-z0-9_-]`. It must never be a real MRN, encounter id, or anything derivable from identity. It exists so consent records can reference the same recipient across events without revealing who they are. Generate it once per recipient-context and store the mapping only inside your own systems. |
| `patient_consent_verified` | `true` only when your organization actually verified the patient's informed consent for this disclosure level. Unverified consent degrades the disclosure to the generic statement — the platform fails closed. |

What the engine does with it:

- Disclosed level ≤ recorded consent ceiling, always; unknown consent = `NONE`.
- `NONE` → donor sees only "Your donation was successfully transfused."
- `BROAD_PURPOSE` → adds whitelisted category ("supported emergency care"), nothing else.
- `LIMITED_ANON` → additionally a coarse age band, rendered only if the cohort (same category × age band × window) has at least `PRIVACY_MIN_COHORT` (default 5) similar events; otherwise degrades to `BROAD_PURPOSE`.
- Every decision stores its granted level and degradation reason; provenance binds the rendered message to your VERIFIED event.

Full rationale: docs/privacy-model.md.

## 7. Corrections and transfers

### Corrections

Clinical history is immutable. To fix a wrong event, submit a new event with:

```json
{
  "event_type": "EVENT_CORRECTION",
  "external_event_id": "<your-new-unique-id>",
  "correction_of_source_event_id": "<external_event_id of the event being corrected>",
  "...": "corrected fields"
}
```

Rules:

- The correction target must exist under the **same source system** (your credentials' source); otherwise `409`.
- The original event is marked superseded; both remain queryable for audit. Nothing is updated or deleted.

### Transfers between facilities

When a blood bank dispatches a unit to a hospital, the `COMPONENT_TRANSFERRED` event carries the destination in metadata:

```json
{ "metadata": { "destination_facility_code": "HOSP-B-LAB01" } }
```

Convention: `destination_facility_code` must equal the receiving facility's `Facility.externalCode` as registered by the platform operator during onboarding. Exactly one active match links the transfer internally; zero or ambiguous matches leave the event `PENDING` with `metadata.resolution = DESTINATION_FACILITY_UNRESOLVED` rather than guessing. The receiving hospital then confirms with `COMPONENT_RECEIVED`.

## 8. Delivery semantics, retries and replay protection

- **Idempotency:** `(sourceSystem, sourceEventId)` is globally unique. Deliveries are at-least-once safe: resending the same `external_event_id` returns `200 {"status":"duplicate"}` with the original event id and creates nothing.
- **Replay protection:** the ±300-second timestamp window makes captured requests unusable later; signatures cover the body, so contents cannot be swapped.
- **Retry guidance:** treat `5xx` and network timeouts as retryable with the *same* payload and `external_event_id` (idempotent). Treat `4xx` (except `429`) as permanent — fix the payload. On `429`, honor `Retry-After`.
- **Ordering:** emit promptly but do not buffer to preserve order — state derivation orders by `occurred_at`, and late/out-of-order events are expected in real systems.

## 9. Response codes

| Status | `error.code` | When |
| --- | --- | --- |
| `202` | — (body `{ok:true,status:"accepted",data:{...}}`) | Event accepted and appended (`data.lifecycleEventId`, disclosure outcome if any). |
| `200` | — (body `{ok:true,status:"duplicate",data:{duplicateOf:...}}`) | Idempotent replay of an already-accepted `external_event_id`. |
| `400` | `BAD_REQUEST` | Malformed request (e.g. invalid JSON). |
| `401` | `UNAUTHORIZED` | Missing headers, bad/stale timestamp, bad signature, unknown or revoked key. |
| `403` | `FORBIDDEN` | Authenticated but not authorized for the referenced resource (e.g. identifier belongs to another organization). |
| `409` | `CONFLICT` | Identifier (or correction target, or destination facility semantics) cannot be resolved. |
| `422` | `VALIDATION_ERROR` | Schema validation failed; body includes per-field `issues`. |
| `429` | `RATE_LIMITED` | Per-key rate limit exceeded; honor `Retry-After`. |
| `500` | `INTERNAL` | Unexpected server error. Retry with the same idempotency key. |

Error bodies always use the envelope `{ok:false,error:{code,message}}`; messages are generic and never leak internals.

## 10. Adapter interface (in-process integrations)

Platforms embedding RaktSetu logic directly (or contributing new source connectors) implement the `BloodSystemAdapter` boundary rather than calling services ad hoc:

```ts
interface BloodSystemAdapter {
  id: string;
  kind: "BLOOD_BANK" | "HOSPITAL";
  getDonation(ref): Promise<DonationSnapshot | null>;
  getComponents(donationRef): Promise<ComponentSnapshot[]>;
  getLifecycleEvents(ref): Promise<NormalizedEvent[]>;
  verifyIdentifier(id): Promise<boolean>;
  normalizeEvent(raw): NormalizedEvent; // throws on unmappable input
}
```

Guidance for a new adapter:

1. Map only what your source truly provides; throw on unmappable fields instead of inventing values.
2. Produce `NormalizedEvent`s whose `eventType` comes from the closed catalog (§5).
3. Route every produced event through `ingestEvent()` — adapters never write events themselves.
4. Add unit tests covering forged/duplicated/out-of-order inputs.

Use `MockBloodBankAdapter` as the reference implementation: it demonstrates snapshot/event normalization and feeds the demo simulator through the standard pipeline. Additional adapters (CSV import, FHIR/R4, e-RaktKosh, HIS/LIS) are documented design targets until real upstream APIs can be verified — none are claimed as live integrations.

## 11. ABDM / FHIR pathway (design direction, not a shipped integration)

India's Ayushman Bharat Digital Mission (ABDM) defines HIP consent artefacts and FHIR R4-based exchange. The planned mapping, confined entirely to the adapter boundary (core domain never learns FHIR):

| FHIR R4 / ABDM concept | RaktSetu target |
| --- | --- |
| ABDM HIP consent artefact | `DisclosureConsent` record (level, category, expiry, revocation) |
| `Procedure` (transfusion performed) | `NormalizedEvent` → `COMPONENT_TRANSFUSED` (+ disclosure payload) |
| `ServiceRequest` (issue/order context) | Supporting context for `COMPONENT_RESERVED` / `COMPONENT_ISSUED` mapping |
| `Transport` (delivery legs) | `COMPONENT_TRANSFERRED` / `COMPONENT_RECEIVED` mapping |

**Status:** no verified ABDM/FHIR or e-RaktKosh integration exists today. Real upstream semantics require verified API documentation before any adapter ships; this section documents intent only.

---

Questions about onboarding (credential issuance, facility code registration, rate allocation) go to your platform operator contact. Privacy obligations for partners are described in docs/privacy-model.md.
