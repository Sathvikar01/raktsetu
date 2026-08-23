# Problem Analysis

## What we are building
A **privacy-preserving transparency and donor-engagement layer** that sits *on top of* existing
blood-bank / hospital infrastructure. It consumes lifecycle events (collection → processing →
component creation → transfer → issue → transfusion / expiry / discard) and shows the **donor** a
verified journey of their own donation, with recipient privacy protected by design.

The closed loop today: `Donate → Leave → Never know`. Target loop:
`Donate → Follow journey → See verified impact → Feel connected → Donate again`.

## What it is NOT (boundaries)
Not a blood bank, not inventory software, not an e-RaktKosh replacement, not a HIS/LIS, not a
donor-recipient marketplace, not a public medical-record database, not a blockchain project, and
never an exposer of recipient identities.

## Domain reality (assumptions documented)
1. **One donation ≠ one unit of outcome.** Whole-blood donation typically separates into RBC,
   plasma, platelets; each has its own lifecycle, expiry clock, and destination.
   Apheresis donations may yield a single component. The lineage model must be n-ary.
2. **Identifiers vary wildly.** Large centres use ISBT 128 DINs; many Indian centres use
   facility-local barcodes or e-RaktKosh unit ids. We therefore store *multiple external
   identifiers per object* plus our own internal UUID, never assuming one scheme.
3. **Most centres have no usable API today.** Integration must be adapter-based: mock adapters for
   demo/dev, webhook/CSV/FHIR adapters later — without core rewrites.
4. **Hospitals are the source of transfusion truth**, and they (with patient consent) are the only
   parties who may release anonymous context about use.
5. **Events beat status fields.** Real systems emit events out of order, duplicated, and sometimes
   wrong. So: immutable append-only event log + derived state + idempotency keys + auditable
   correction events. No silent mutation of clinical history.
6. **Verification matters.** A donor-visible "transfused" claim must map to a VERIFIED event from a
   known organization/system, else it renders as pending/unverified.

## Privacy risk analysis
- Recipient re-identification via "anonymous" details (rare condition + age + place + time).
  Mitigation: fixed coarse age bands, broad categories, k-anonymity floor, day-granularity,
  fail-closed degradation.
- Donor-side linkage attacks: donation date+centre can be sensitive; donor data is private to the
  authenticated donor only.
- Deferral/test-result leakage: this platform deliberately carries **no** donor serology results;
  any such communication belongs to legally-compliant blood-centre workflows, not a transparency
  feed.
- Aggregate leakage: small cohorts (single-district rare categories) suppressed below thresholds.

## Emotional design risks
- Overclaiming ("you saved a life") is medically and ethically unsound ⇒ verified-claim-only copy.
- Shaming donors on expiry/discard ⇒ neutral lifecycle-complete copy.
- Manipulative gamification ⇒ milestones as gratitude, never leaderboards or financial rewards.

## MVP vs production requirements
| MVP now | Production later |
| --- | --- |
| Mock BB/Hospital adapters + simulator | e-RaktKosh / FHIR / HIS adapters after verification |
| HMAC-signed partner API | mTLS + key rotation ceremony + IP allowlists |
| Email = logged outbox (dev) | real SMTP/provider, SMS/WhatsApp channel adapters |
| SQLite dev fallback | PostgreSQL via docker-compose (primary target) |
| Password auth, MFA-ready schema | TOTP/WebAuthn enforcement for all staff roles |
| Manual staff actions | events flow automatically from integrations |

## Legal/regulatory notes (design constraints, not compliance claims)
DPDP Act 2023 principles baked in: purpose limitation, minimization, consent notice/records,
withdrawal, grievance/redressal hooks, retention policy config. **Code alone does not equal legal
compliance** — a real deployment requires legal, clinical, security and regulatory review with
licensed blood centres/hospitals (documented in deployment.md).
