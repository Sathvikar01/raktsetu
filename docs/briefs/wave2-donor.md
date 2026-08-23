# BRIEF: Donor app (Wave 2)

Working dir: C:\Users\arsat\OneDrive\Desktop\blood (Windows, PowerShell).
FIRST read completely: CONTRACTS.md, src/lib/services/disclosure-view.ts, account.ts,
src/packages/domain/derive.ts, src/lib/auth/session.ts, src/lib/rbac.ts, src/app/(auth)/actions.ts
(action style + error-code pattern), src/packages/ui/index.ts, src/i18n/messages/en.ts,
src/packages/database/schema.prisma (Donation, BloodComponent, Notification,
NotificationPreference, ConsentRecord models).

## Exclusive ownership (touch NOTHING else)
- src/app/(donor)/**  and src/app/dashboard/** if you prefer a non-grouped route — pick ONE;
  the auth actions redirect donors to /dashboard so that exact path must exist.
- May ADD keys under `donor:` namespace ONLY in src/i18n/messages/en.ts (concurrent edits by
  other agents: re-read right before each edit, append-only).

## Hard rules (privacy-first; violations = rework)
- Render donor-visible data ONLY through disclosure-view.ts outputs (getComponentDonorView /
  assembleComponentDonorView / buildVerifiedDecisionView / renderDisclosureMessage) and
  deriveDonationProgress. Never read RecipientContext or DisclosureConsent directly for display.
- No recipient/patient identifiers anywhere in markup, even degraded. Timeline entries show
  eventType label key, occurredAt, facility name only when the view includes it.
- requireRole("DONOR") on every page/layout. PLATFORM_ADMIN viewing a donor page -> redirect
  /forbidden (do NOT let staff browse donor views).
- All strings via i18n keys; no hard-coded copy.

## Build
1. `/dashboard`: greeting, list of the user's donations via prisma.donation.findMany where
   donorProfileId = session donorProfileId, newest first. Per donation card: DIN masked to last 4
   with reveal toggle? NO - show din only if present, it is donor-facing by design; status badge
   from deriveDonationProgress(collected/processingCompleted/componentsReady/patientCareReached)
   rendered with ui/Stepper; linkCode entry form (server action -> linkDonationToDonor) for
   linking new donations; empty state pointing at demo flow.
2. `/dashboard/donations/[id]`: ownership check (donation.donorProfileId must equal session's,
   else notFound()). Donation header (din, donatedAt, bloodGroup, progress stepper). Components
   section: one ui/Card per component via getComponentDonorView(componentId): componentType
   label, derived state badge, timeline of allowed entries (the view already filters), verified
   impact block when a TRANSFUSED decision exists (buildVerifiedDecisionView output: granted
   level chip, message via renderDisclosureMessage, provenance summary line "verified against
   event/org/source ids" WITHOUT leaking ids beyond what provenance summary exposes). Handle
   degradedReason display (COHORT_TOO_SMALL etc.) as calm explanatory copy.
3. `/dashboard/notifications`: in-app notifications for session user, newest first, unread bold +
   mark-all-read server action (notification:write:own). Show typeKey-derived generic title/body;
   related donation/component links where present.
4. `/dashboard/settings`: two cards:
   - Notification preferences: form over NotificationPreference (inApp, email, sms, whatsapp,
     push, descriptiveContent, locale select limited to LOCALES) upserting on save.
   - Consent history: list ConsentRecord rows for the user (version, scope/type, createdAt,
     revokedAt); action to record a new consent version and/or revoke latest per schema fields
     you find - keep it honest to the model, do not invent columns.

## Verification gate (must pass before finishing)
1. npx tsc --noEmit -> exit 0
2. npx next build -> success
3. npx vitest run -> all pre-existing tests still green
Report files created, deviations w/ reasons.
