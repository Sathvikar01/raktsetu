# BRIEF: Public site + UI kit + auth pages agent

Working dir: C:\Users\arsat\OneDrive\Desktop\blood (Windows, PowerShell).

FIRST read: CONTRACTS.md, src/i18n/messages/en.ts (public namespace is yours), tailwind.config.ts,
src/app/globals.css, src/lib/services/stats.ts, src/lib/services/account.ts,
src/lib/auth/session.ts, src/middleware.ts, package.json.

## Exclusive ownership
- src/packages/ui/** (new) — presentational components only, no data fetching
- src/components/site/** (new) — header/footer/demo-banner shared layout pieces
- src/app/(public)/** — move current src/app/page.tsx INTO this group; create:
  /  (landing per spec §40), /about, /how-it-works, /community-impact, /privacy, /partners,
  /developers, /open-source
- src/app/login/page.tsx, src/app/register/page.tsx + src/app/(auth)/actions.ts server actions
- src/app/error.tsx, src/app/not-found.tsx, src/app/forbidden/page.tsx
- May ADD keys under `public:`/`common:`/`nav:` namespaces only in src/i18n/messages/en.ts
  (re-read before editing; others edit concurrently).

## Requirements
Landing hero exactly this hierarchy (spec §40): kicker "An open, community-run transparency layer",
title lines "Your donation doesn't end / when you leave the blood bank.", body "Follow its journey.
See its verified impact. Protect every patient's privacy.", CTAs [View demo → /how-it-works#demo]
[Learn how it works → /how-it-works]. Then the flow strip YOU DONATE → BLOOD BANK → COMPONENT
PREPARATION → PATIENT CARE → YOU GET TO KNOW (styled stepper, not emoji dump). Sections: privacy
model summary, verified-only claims, community stats teaser (real numbers from getCommunityStats()
via a small server component wrapper), open-source mission, partners placeholder list of the two
DEMO orgs clearly labelled synthetic demo participants, contribution CTA linking /open-source and
/developers. No fabricated external URLs anywhere (link internally only).

UI kit (src/packages/ui): Button (variants primary/secondary/ghost/danger, sizes), Card/CardHeader/
CardTitle/CardBody, Badge (tone variants incl component colors RBC=crimson, PLASMA=amber,
PLATELET=orange), Input, Label, Textarea, Select, Alert (info/warn/success), StatTile, SectionHeading,
Timeline (vertical line + dots, items {title, date?, body?, icon?}), Stepper (horizontal progress),
EmptyState, Table primitives for staff later, Spinner. Accessible: semantic elements, focus-visible
ring already global, aria labels, keyboard operable. lucide-react icons allowed.

/community-impact: aggregate stats via getCommunityStats() + simple SVG bar chart component
(no chart libs). Show privacy note that aggregates below thresholds are suppressed. If DEMO_MODE,
show visible banner "Demo environment — all data shown is synthetic" (use env.DEMO_MODE server-side;
also add same banner to site footer when on).

/how-it-works: donor journey explainer incl #demo section describing how to run the seeded demo
(reference docs/demo-flow.md paths textually).

/privacy: plain-language privacy model page (recipient privacy, consent levels 0/1/2, k-anonymity
floor, DPDP principles, what we never store). /about: mission + what platform is NOT. /partners:
for blood banks/hospitals — value prop + link /developers + contact-by-GH note. /developers:
integration API quickstart showing exact headers X-RaktSetu-Key/-Timestamp/-Signature, sample signed
payload curl snippet, event catalog table from EVENT_TYPES, adapter interface excerpt, ABDM/FHIR
adapter note. /open-source: Apache-2.0 choice rationale, self-host pitch, contributing links
(/docs paths textual), no-donor-data-sale pledge.

Auth pages: /login (email+password; server action calls authenticate() then redirect by role:
DONOR→/dashboard, ORG_STAFF|ORG_ADMIN→/staff, PLATFORM_ADMIN→/admin); /register (displayName+
email+password w/ client-side hints, registerDonor() then auto-login via authenticate() then
/dashboard). Generic error copy only ("Invalid email or password."). Rate-limit message distinct.
Server actions must call redirect() after createSession. Forms must work without JS where possible
(progressive enhancement, action={serverAction}).
error.tsx: friendly recovery UI (client comp with reset). not-found.tsx + /forbidden styled.

Design language: calm canvas bg, white rs-cards, teal primary buttons, crimson accents sparingly,
rounded-xl2, generous spacing, mobile-first responsive, dark-ink headings. Use i18n translate() or
direct dictionary import server-side (getDictionary().public.*) — NO hardcoded English strings in
components except code identifiers.

## Verification gate
1. npx tsc --noEmit → exit 0
2. npm run build → succeeds (pages render; stats query runs against dev.db which may be empty —
   handle zero counts gracefully)
3. npx next start not required; just ensure build output clean.
Report pages built, components list, build result.
