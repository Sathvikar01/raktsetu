# Contributing to RaktSetu

Thank you for helping build trustworthy blood-donation transparency. This project has one non-negotiable hierarchy: **privacy invariants override engagement features override convenience**.

## Development setup

Prerequisites: Node.js 20+. Docker optional (PostgreSQL for production-parity testing).

```powershell
npm install
Copy-Item .env.example .env
npm run db:push          # SQLite dev database
npm run seed             # synthetic demo world (wave-2)
npm run dev
```

Verify your environment before starting work:

```powershell
npm run typecheck
npm test
```

## Ground rules

Read [CONTRACTS.md](CONTRACTS.md) first — it wins over code when they disagree. Highlights:

- Privacy invariants PI-1..PI-13 (docs/privacy-invariants.md) are machine-enforced; the build fails if violated.
- Never render, log or persist recipient-identifying data.
- `LifecycleEvent` rows are append-only; corrections are new `EVENT_CORRECTION` events.
- All mutating staff/partner flows go through `ingestEvent()` — no side doors.
- Every user-visible string goes through the i18n dictionary (`src/i18n/messages/en.ts`).
- No fake buttons, dead links, or placeholder APIs.
- Server Components by default; `"use client"` only where interaction demands it.
- IDs in URLs are internal UUIDs — never names, phones, or cross-tenant external ids.

## Code style

- TypeScript **strict**: no `any`, no `@ts-ignore` without a linked issue and justification comment.
- Pure logic (domain, privacy) stays pure: no `"server-only"` imports in `packages/domain` or `packages/privacy`.
- Follow existing file organization and naming; mimic neighboring code before introducing new patterns.
- Accessibility is part of definition-of-done: semantic landmarks, labeled inputs, focus-visible states, alt text.

## Branches and commits

Branch naming:

- `feature/<short-name>` — new functionality
- `fix/<short-name>` — bug fixes
- `docs/<topic>` — documentation-only changes

Use Conventional Commits style for commit messages:

```
feat(ingest): resolve destination facility by externalCode
fix(privacy): degrade LIMITED_ANON when cohort below k
docs(integration): clarify timestamp window semantics
chore(deps): bump prisma to 5.22.0
```

Scope: keep PRs focused; unrelated refactors belong in their own PR.

## Tests

- `npm test` runs the vitest suites under `tests/`.
- **Privacy-touching changes require invariant tests**: if your change touches disclosure, consent, metadata sanitization, tenant scoping, or anything covered by docs/privacy-invariants.md, you must add/update tests in `tests/unit/privacy/` or `tests/unit/security/` demonstrating the invariant holds. PRs missing these are blocked by review policy.
- New API behavior needs acceptance-test traceability where applicable (docs/acceptance-tests.md).

## Pull request checklist

Before requesting review, confirm every item:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes (and new tests cover the change)
- [ ] Invariant tests added/updated for any privacy-touching change
- [ ] **Privacy review question: "Does this change reveal more than before?"** If yes — to donors, partners, the public, or log readers — justify it against the invariants or redesign.
- [ ] No new dependency without justification (minimal dependency surface is a security goal)
- [ ] User-visible strings are in the i18n dictionary, not hardcoded
- [ ] Docs updated if you changed contracts, schemas, env vars, or behavior described in docs/
- [ ] Fails closed: unknown/error paths degrade toward less disclosure and honest "temporarily unavailable" copy
- [ ] Demo/synthetic data appears only behind SYNTHETIC labelling

## Reporting issues

- Security vulnerabilities: follow [SECURITY.md](SECURITY.md) — never public issues.
- Behavior bugs: include reproduction steps, expected vs actual, and environment details.
- Spec questions: reference the relevant section of CONTRACTS.md or docs/.

## Licensing

By contributing you agree your contributions are licensed under the Apache License 2.0 ([LICENSE](LICENSE)).
