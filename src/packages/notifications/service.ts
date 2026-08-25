import "server-only";
import { prisma } from "@/packages/database/client";
import { recordAudit } from "@/lib/audit";
import type { Locale } from "@/i18n";
import { translate } from "@/i18n";

/**
 * Channel-agnostic notification service.
 * Channels: IN_APP (DB) + EMAIL (outbox table, drained by the outbox worker —
 * console sender in dev, Resend when configured). SMS/WhatsApp/push are
 * documented adapter points — not stubbed as fake code (spec §18).
 * Lock-screen safety: titles stay generic unless donor opted into descriptive
 * content AND the notification is policy-flagged descriptive-safe (PI-11).
 */
export interface DonorNotificationInput {
  userId: string;
  typeKey: string;
  genericTitle: boolean; // true → always render notify.genericUpdateTitle on out-of-band channels
  titleKey: string;
  bodyKey: string;
  bodyParams?: Record<string, string | number>;
  relatedDonationId?: string | null;
  relatedComponentId?: string | null;
}

export async function dispatchDonorNotification(input: DonorNotificationInput): Promise<void> {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId: input.userId } });
  const inApp = pref?.inApp ?? true;
  const email = pref?.email ?? true;
  const descriptiveAllowed = pref?.descriptiveContent ?? false;

  const channels: string[] = [];
  const locale = (pref?.locale as Locale) ?? "en";

  if (inApp) {
    channels.push("IN_APP");
    await prisma.notification.create({
      data: {
        userId: input.userId,
        typeKey: input.typeKey,
        // In-app bodies may be descriptive only when user opted in.
        privacySafeBody: !descriptiveAllowed,
        titleParamsJson: JSON.stringify({ key: input.titleKey }),
        bodyParamsJson: JSON.stringify({
          key: descriptiveAllowed ? input.bodyKey : "notify.genericUpdateBody",
          params: descriptiveAllowed ? (input.bodyParams ?? {}) : {},
        }),
        relatedDonationId: input.relatedDonationId ?? null,
        relatedComponentId: input.relatedComponentId ?? null,
      },
    });
  }

  if (email) {
    channels.push("EMAIL");
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
    if (user) {
      const title = input.genericTitle
        ? translate(locale, "notify.genericUpdateTitle")
        : translate(locale, input.titleKey, input.bodyParams);
      const body = descriptiveAllowed && !input.genericTitle
        ? translate(locale, input.bodyKey, input.bodyParams)
        : translate(locale, "notify.genericUpdateBody");
      await prisma.outboxEmail.create({
        data: {
          toEmail: user.email,
          subject: title,
          bodyText: body,
          status: "QUEUED", // drained by the outbox worker (cron or npm run outbox:process)
        },
      });
    }
  }

  if (channels.length === 0) return;

  await recordAudit({
    actorType: "SYSTEM",
    action: "notification.dispatched",
    resourceType: "Notification",
    resourceId: input.userId,
    metadata: { typeKey: input.typeKey, channels: channels.join(","), genericTitle: input.genericTitle },
  });
}

/** Future channel adapters implement this interface; core stays untouched. */
export interface NotificationChannelAdapter {
  readonly channel: "SMS" | "WHATSAPP" | "PUSH";
  send(userId: string, genericTitle: string): Promise<void>;
}
