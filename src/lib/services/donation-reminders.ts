import "server-only";
import { prisma } from "@/packages/database/client";
import { dispatchDonorNotification } from "@/packages/notifications/service";
import { recordAudit } from "@/lib/audit";
import { eligibilityWindow, DONATION_INTERVAL_DAYS } from "@/packages/domain/eligibility";

/**
 * Opt-in "likely eligible again" reminder sweep.
 *
 * One reminder per donation, ever: the dedup marker is an append-only
 * AuditLog row (action notification.eligibility_reminder_sent keyed on the
 * donation id), so re-runs — cron every 15 minutes, manual `npm run
 * maintenance` — are idempotent no-ops regardless of which channels a
 * donor's preferences produce. Reminder copy contains no recipient-derived
 * content; the date and interval come from the donor's own linked donation.
 */
export const REMINDER_TYPE_KEY = "notify.eligibility.reminder";
const REMINDER_AUDIT_ACTION = "notification.eligibility_reminder_sent";

const bodyDateFmt = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" });

export interface RemindersRunSummary {
  /** Donors with reminders enabled whose latest donation was considered. */
  checked: number;
  /** Reminders actually dispatched (dedup makes this ≤ 1 per donation). */
  sent: number;
}

export async function runDonationReminders(now = new Date()): Promise<RemindersRunSummary> {
  const prefs = await prisma.notificationPreference.findMany({
    where: { donationReminders: true },
    select: {
      userId: true,
      locale: true,
      user: { select: { donorProfile: { select: { id: true } } } },
    },
  });

  let sent = 0;
  let checked = 0;

  for (const pref of prefs) {
    const donorProfileId = pref.user.donorProfile?.id;
    if (!donorProfileId) continue;

    const latest = await prisma.donation.findFirst({
      where: { donorProfileId, linkStatus: "LINKED" },
      orderBy: { donatedAt: "desc" },
      select: { id: true, donatedAt: true },
    });
    if (!latest) continue;

    const window = eligibilityWindow(now, latest.donatedAt);
    if (!window.eligible) continue;

    checked += 1;

    const alreadyReminded = await prisma.auditLog.findFirst({
      where: {
        action: REMINDER_AUDIT_ACTION,
        resourceType: "Donation",
        resourceId: latest.id,
      },
      select: { id: true },
    });
    if (alreadyReminded) continue;

    const locale = pref.locale ?? "en";
    await dispatchDonorNotification({
      userId: pref.userId,
      typeKey: REMINDER_TYPE_KEY,
      genericTitle: false,
      titleKey: "notify.reminderTitle",
      bodyKey: "notify.reminderBody",
      bodyParams: {
        days: DONATION_INTERVAL_DAYS.WHOLE_BLOOD,
        date: bodyDateFmt.format(latest.donatedAt),
      },
      relatedDonationId: latest.id,
      alwaysDescriptive: true,
    });
    sent += 1;

    await recordAudit({
      actorType: "SYSTEM",
      action: REMINDER_AUDIT_ACTION,
      resourceType: "Donation",
      resourceId: latest.id,
      metadata: { userId: pref.userId, locale },
    });
  }

  return { checked, sent };
}
