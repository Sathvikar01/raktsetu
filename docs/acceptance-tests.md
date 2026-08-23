# Acceptance Tests (Evaluation-First Contract)

These scenarios define "correct". Implementation is accepted only when every scenario passes as an
automated test or a recorded demo run (`demo-flow.md`).

## AT-1 Donor authentication
- Donor can register, verify session cookie is httpOnly/SameSite, log in, log out.
- Wrong password 10× on one account/IP → rate-limited (429), generic error message.
- Disabled account cannot authenticate.

## AT-2 Donation linking
- Donation created by Blood Bank with external ID `BB-A-D0001` starts UNLINKED.
- Donor submitting the correct opaque link code becomes linked; code single-use.
- Wrong/expired code rejected with generic error; attempts audited.

## AT-3 Multi-component lineage
- Donation D001 produces RBC C001 + Plasma C002 + Platelet C003.
- Each component has independent derived state; dashboard renders three cards.
- Every component resolves to exactly one source donation (lineage invariant).

## AT-4 Verified event ingestion (API)
- Valid HMAC-signed `POST /api/v1/events` with registered partner key returns 202 and creates
  exactly one LifecycleEvent with provenance (org, facility, sourceSystem, sourceEventId).
- Same payload replayed → 200 `{status:"duplicate"}`, no second row (idempotency invariant).
- Bad signature → 401; stale timestamp (>±300s) → 401 replay-rejected; malformed schema → 422;
  unknown component identifier → 409 unresolvable; disabled credential → 401.

## AT-5 Transfusion updates donor timeline end-to-end (§38 demo)
Steps 1–18 of the master spec executed in order:
account → donation → link → 3 components → transfer → receive → transfuse →
disclosure BROAD_PURPOSE/EMERGENCY_CARE → privacy decision → notification created →
authenticated donor sees transfusion in timeline → impact counters increment →
audit rows exist for every operation → public stats increase only in aggregate.

## AT-6 Privacy engine limits context
- Consent NONE → donor sees generic "was transfused" message only.
- Consent BROAD_PURPOSE + category CANCER_CARE → broad-category sentence, no age/facility.
- Consent LIMITED_ANON but cohort size < k (default 5) → degraded to BROAD_PURPOSE (or LEVEL 0 if
  category missing); degradation reason recorded in DisclosureDecision.
- Unknown/unapproved category string → fail-closed to LEVEL 0.
- Engine output can NEVER contain name, phone, exact age, exact time, MRN, or address fields
  (property-tested over generated inputs).

## AT-7 Notifications respect privacy defaults
- Lock-screen-safe title always: "There's an update on your blood donation."
- Descriptive body only when donor preference `descriptiveContent=true` AND policy allows.
- Opt-out of email stops email channel; in-app still available.

## AT-8 Honest non-use
- COMPONENT_EXPIRED/DISCARDED produce the neutral lifecycle-complete copy; no shaming, no clinical
  reasons, no "your blood was wasted" framing anywhere in rendered strings.

## AT-9 Tenant isolation / authorization matrix

| Actor | Action | Expected |
| --- | --- | --- |
| Donor A | GET donor B's donation | 404 |
| Donor | Any staff/admin route | redirect/404 |
| Donor | Query recipient records | impossible — no API surface exists |
| BB-A staff | BB-B donation/component | 404 |
| Hospital B staff | correct Hospital A event | 404 |
| Partner key org A | resolve component of org B | 409/404 |
| Platform admin | read recipient context | no endpoint grants it (deny-by-default) |
| Anonymous | any donor/staff route | login redirect |

## AT-10 Immutable audit
- Every listed sensitive action writes AuditLog (event ingested/corrected, donation linked,
  consent recorded, disclosure generated, credential rotated, permission changed).
- No code path deletes or UPDATEs LifecycleEvent payloads; correction = appended correction event.

## AT-11 Community aggregates safe
- Any aggregate with underlying count < MIN_AGGREGATE(10) suppressed/merged.
- Public pages expose no donation IDs, no timestamps finer than day, no region below state level.

## AT-12 Demo without credentials
- Fresh clone → documented commands → seeded synthetic world → full journey demonstrable with
  zero real healthcare credentials, clearly labelled SYNTHETIC.

## AT-13 Fail-safe errors
- Integration outage surfaces "Latest status temporarily unavailable", never "not used".
- Verification-pending events render as "Status awaiting verification", not as facts.
