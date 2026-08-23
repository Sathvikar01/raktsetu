# Threat Model (STRIDE, donor-transparency context)

Assets ranked: recipient context > donor PII > lifecycle event integrity > platform availability.

## STRIDE summary

### Spoofing
- Forged partner webhooks → HMAC-SHA256 over `timestamp.body` with per-credential secret; ±300s
  timestamp window; constant-time compare; key revocation. Tests: forged/replayed/stale.
- Credential stuffing / session theft → scrypt hashes, DB sessions rotated on privilege change,
  httpOnly+SameSite cookies, Secure in prod, rate limits, generic auth errors.
- Staff impersonation → role + org membership checked server-side on every action; MFA-ready.

### Tampering
- Silent rewrite of clinical history → LifecycleEvent append-only; corrections are new events;
  no UPDATE/DELETE code path for payloads (invariant-tested).
- Cross-tenant writes → every mutation re-checks org ownership of the target resource server-side.
- Payload smuggling → zod strict schemas; unknown fields stripped before persistence.

### Repudiation
- "We never got that event" → IntegrationEvent raw log with body hash + disposition;
  AuditLog actor/action/resource/ip/timestamp for all sensitive actions. No silent deletes.

### Information disclosure
- Recipient identity: not stored at all; disclosure engine whitelist-only output (PI-1..4).
- IDOR on donation/component ids → UUIDs + ownership predicates in queries; security tests.
- Over-aggregation leaks → public stats suppression thresholds (PI-12).
- Log leakage: structured logs exclude payloads containing personal/medical data by construction;
  error serializer redacts known sensitive keys.
- Transport: TLS enforced at proxy/compose level in prod; HSTS + security headers via middleware.

### Denial of service
- Ingestion flooding → per-key rate limits + payload size caps; idempotency makes replays cheap.
- Login/OTP-style abuse → per-IP and per-account lockout windows.
- Public stats expensive queries → cached snapshot table refreshed on write schedule.

### Elevation of privilege
- Role escalation via parameter tampering → server actions re-derive role from session only,
  never from form fields; PLATFORM_ADMIN actions require explicit step-up confirmation.
- Dependency risk → minimal dependency surface (no auth-vendor, no heavy client libs), lockfile,
  documented `npm audit` policy in SECURITY.md.

## Explicit non-goals
Insider threat at a *hospital* mis-entering transfusion truth is mitigated by provenance and
auditability, not preventable by software. Clinical correctness is the blood bank's/LIS's job.

## Residual risks / review-before-production
- Legal review of DPDP consent flows and retention defaults per deployment jurisdiction.
- Hospital-side authentication strength before granting event-submission rights.
- Real e-RaktKosh/FHIR semantics need verified API documentation — none assumed today.
