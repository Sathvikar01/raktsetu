# Security Policy

## Supported versions

RaktSetu is pre-1.0; only the latest revision of the `main` branch receives security fixes.

| Version / branch | Support |
| --- | --- |
| latest `main` | Supported — security fixes land here first |
| older commits, tags, forks | Not supported — upgrade before reporting deployment issues |

Operators are responsible for tracking `main` (or a tagged release) and applying updates promptly per docs/deployment.md §8.

## Reporting a vulnerability

Please report privately. **Do not open public GitHub issues for security problems.**

1. **Preferred:** use GitHub's *private vulnerability reporting* feature on this repository (Security tab → Report a vulnerability). This reaches the maintainers without public disclosure.
2. **Alternative:** email the platform security contact at `security@raktsetu.example` *(placeholder — each production operator must publish and maintain their real contact address here in their deployment fork)*.

Include: affected component/paths, impact hypothesis, reproduction steps or proof-of-concept, and any logs (redacted — never include real PHI/PII in reports).

**PGP:** optional. If you need encrypted email, request a key over the plain channel first; a project PGP fingerprint will be published here once established (none is claimed today).

What to expect:

- **Acknowledgement:** within 3 business days.
- **Triage & severity rating:** within 7 business days.
- **Fix target:** critical ~30 days; high ~60 days; medium/low best-effort or next release.
- You will get status updates at least every 14 days until resolution.

## Scope

In scope:

- Code in this repository: authentication/session handling, RBAC, ingestion API (`POST /api/v1/events`) including HMAC verification, privacy/disclosure engine, tenant isolation, metadata sanitization, audit integrity.
- The bundled infrastructure references when they ship (Dockerfile/compose) — e.g. insecure defaults.

Out of scope:

- Misconfiguration of *your* deployed instance by operators (weak `APP_SECRET`, exposed databases, disabled TLS) unless it stems from shipped defaults or documentation errors.
- Social engineering, phishing, physical access attacks.
- Volumetric denial-of-service and resource exhaustion without a demonstrated confidentiality/integrity impact.
- Spam, content injection into demo data, or reports from automated scanners without validation.
- Upstream services we do not operate (no e-RaktKosh/FHIR integrations exist yet).

Safe-harbor: we will not pursue action against good-faith research that respects user data, avoids service degradation, uses your own test accounts/data, and reports promptly through the channels above. Never access, exfiltrate or modify real personal data to prove a finding — demonstrate with synthetic data.

## Disclosure policy

Coordinated disclosure with a **90-day** window from first report:

1. We acknowledge, triage, and agree on severity with you.
2. We develop and verify a fix on `main`.
3. On fix release (or at 90 days, whichever comes first), the issue is publicly disclosed with credit to you unless you prefer anonymity.
4. We may publish advisories for critical issues earlier if active exploitation is suspected.

Dependency hygiene: keep the dependency surface minimal; run `npm audit` before releases and after dependency changes; review and document any findings that cannot be fixed immediately.
