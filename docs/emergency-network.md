# Emergency blood discovery network

RaktSetu's emergency network turns a verified blood need into a progressively
widening, privacy-preserving search across participating blood banks and
opted-in donors. It layers on top of the existing transparency platform —
inventory facts, org verification, notifications and audit trails are reused,
not duplicated.

> **Not a medical or emergency-response service.** The network coordinates
> logistics only. In a life-threatening emergency, contact emergency services
> first. Final eligibility and every clinical decision stay with medical
> professionals.

## The resolution pipeline

Fixed order, auditable, never a dead end:

```
EmergencyRequest ──► nearby blood banks ──► compatible inventory
                          │ (covers the request? ──► FULFILLED)
                          ▼
                 nearby verified donors ──► expanded radius (progressive)
                          │ (a donor accepts ──► DONOR_FOUND)
                          ▼
                 partner / camp network — request stays open until expiry
```

1. **Blood-bank-first.** ACTIVE blood-bank organizations within the urgency's
   radius ladder are swept closest-first; their AVAILABLE, unexpired, ABO/Rh-
   compatible components are counted. If bank stock covers the requested units,
   the request fulfills with zero donor exposure.
2. **Compatibility engine.** Recipient group × component type maps to
   compatible donor/inventory groups (RBC transfusion rules; mirrored plasma
   rules for plasma/platelets; exact match only for whole blood). Exact-group
   stock is preferred, compatible stock is accepted. Pure functions live in
   `src/packages/domain/compatibility.ts`.
3. **Donor fallback.** Only phone-verified, available (not paused), ACTIVE
   donors past the 90-day deferral window — and inside BOTH the request's
   current radius rung and the donor's own notification radius — are matched.
4. **Progressive radius.** Rung ladders per urgency (`src/packages/domain/
   emergency.ts`): EMERGENCY 3→7→15→30→60→120 km, URGENT 5→12→25→50→100,
   ROUTINE 10→25→60→120. A dwell window per rung (1/3/10 minutes) lets
   nearby donors respond before the pool widens. At most 12 donors are
   notified per rung, 40 per request.
5. **Partner/camp network.** When even the widest rung yields nothing new,
   the request is marked escalated and stays searchable until expiry — the
   search never silently ends.

## Request lifecycle

`PENDING → SEARCHING_BANKS → SEARCHING_DONORS → DONOR_FOUND → FULFILLED`,
plus `EXPIRED` / `CANCELLED` exits. Expiry: 6h (EMERGENCY), 24h (URGENT),
72h (ROUTINE). Every transition appends a timeline event
(`EmergencyRequestEvent`); the requester watches it live at
`/emergency/{publicToken}` — the unguessable token is the capability, no
login required. Status polls opportunistically advance the pipeline between
cron ticks; the dedicated sweep runs on `/api/cron/emergency` every 5 minutes
(Vercel) or via `npm run maintenance` (self-hosted).

## Security model

- **OTP verification** before request creation and donor phone registration:
  6-digit codes, peppered hashes at rest, 5-minute expiry, max 5 attempts,
  single-use verification tokens consumed atomically by the guarded mutation.
  Issue-side throttling: 3 codes per phone / 15 min and 20 per IP / hour,
  fail-closed on limiter outage.
- **Rate limits** on request creation (3 per phone / day, 10 per IP / day),
  status polling (60/min/IP) and camp registration (5/day per account or IP).
- **Duplicate / fake-request detection**: active-request-per-phone rejection,
  rapid-repeat flagging, same-city/same-group cluster flagging → surfaced for
  platform-admin moderation on `/admin/platform`; blocking halts the pipeline
  instantly; unblocking restores it.
- **RBAC**: `emergency:moderate` / `camp:moderate` (PLATFORM_ADMIN),
  `camp:write:own-org` (ORG_ADMIN), `match:respond:own` (DONOR) — the same
  deny-by-default matrix as the rest of the platform.
- **Audit logs** for every create/notify/accept/decline/fulfill/expire/
  moderate/camp action (append-only, ids only).

## Privacy model

| Surface | Exposed about a donor |
| --- | --- |
| While searching | blood group, approximate distance (whole km), availability — nothing else |
| After a donor accepts | first name + masked phone (last 4), for that requester only |
| Never | full phone number, exact coordinates, email, donation history |

Phones are stored encrypted (AES-256-GCM, delivery-only) and hashed (keyed
HMAC, lookup/throttle); they are never rendered — masked output only, and
notification metadata is sanitized the same as lifecycle events. Donor
coordinates are quantized to a ~1 km grid at write time (`domain/geo.ts`).
Out-of-band SMS/WhatsApp copy stays generic (lock-screen safety, PI-11);
requester contact phones follow the same encrypt+hash scheme.

## Donor controls

Dashboard → Settings → Emergency donor network:

- **Pause availability** — instant; a paused donor is invisible to every search.
- **Notification radius** — 5–100 km; a request never notifies beyond it.
- **Location** — re-captured or updated manually; always quantized.
- **Withdraw** — wipes phone material, location and availability immediately.

Match alerts arrive via in-app notifications and email; SMS/WhatsApp are
delivered when a provider adapter is registered (`setSmsSender()`) and the
donor opted in. Donors accept/decline on `/dashboard/requests`; accepting
shares first name + masked phone with that requester only.

## Camps

Verified ACTIVE organizations (org admins) register camps under
`/admin` → Camps; camps start `PENDING_APPROVAL` and only platform admins
can approve them for the public `/camps` discovery page (geo-sorted when
coordinates are given). Registration is per-account (logged-in donors) or
per-IP (visitors); phones stored hashed; camps auto-complete when past their
end time.

## Data model (new models)

`EmergencyRequest` (+ `publicToken`, `contactPhoneHash/Encrypted`,
`radiusKm`/`radiusRound`/`lastDonorScanAt`, `moderationStatus`),
`EmergencyRequestEvent`, `EmergencyMatch` (BANK|DONOR, distance, status,
unique per request+org / request+donor), `OtpChallenge`, `Camp`,
`CampRegistration`; plus geo/availability/notification-radius fields on
`Organization` and `DonorProfile`.

## Testing

- `tests/unit/domain/compatibility.test.ts` — ABO/Rh engine (RBC + plasma
  mirror + whole blood).
- `tests/unit/domain/geo.test.ts` — haversine, bounding boxes, quantization.
- `tests/unit/domain/eligibility-rules.test.ts` — questionnaire rules.
- `tests/integration/emergency.test.ts` — the full pipeline through real
  services: OTP issue/verify/throttle/lock, bank-first fulfillment, compatible
  stock across groups, duplicate/unverified rejection, progressive radius
  with guardrails (paused/deferred/wrong-group/small-radius donors never
  match), donor accept → mediated contact, sweep expiry, admin blocking.
- `tests/integration/camps.test.ts` — camp lifecycle, discovery ordering,
  registration limits, auto-completion.
