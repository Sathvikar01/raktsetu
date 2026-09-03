"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import {
  clientIpFrom,
  hashedLimitKey,
  rateLimitPersistent,
} from "@/lib/rate-limit";
import { prisma } from "@/packages/database/client";
import { dispatchDonorNotification } from "@/packages/notifications/service";
import { getDictionary } from "@/i18n";
import type { PartnerRequestState } from "./types";

/**
 * Public partner onboarding request. Persists a PENDING row for platform-admin
 * review; no credentials, no org is created by the form itself.
 */

const RequestSchema = z.object({
  orgName: z.string().trim().min(2).max(120),
  orgKind: z.enum(["BLOOD_BANK", "HOSPITAL", "NGO"]),
  contactName: z.string().trim().min(2).max(120),
  workEmail: z.string().trim().email().max(200),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
});

async function clientIpHash(): Promise<string | null> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  if (!ip) return null;
  // Coarse salted hash — enough for abuse throttling, not reversible to an IP.
  return createHmac("sha256", process.env.APP_SECRET ?? "rs-ip-salt").update(ip).digest("hex");
}

export async function submitPartnerRequestAction(
  _prev: PartnerRequestState | null,
  formData: FormData
): Promise<PartnerRequestState> {
  const d = getDictionary();
  const t = d.public.partnerRequest;

  const h = await headers();
  const ip = clientIpFrom(h) ?? "unknown";
  // Per-IP bucket (hashed) — one visitor can no longer exhaust the single
  // global quota for everyone.
  const rl = await rateLimitPersistent(
    `partner-request:${hashedLimitKey("ip", ip)}`,
    5,
    15 * 60_000
  );
  if (!rl.ok) {
    return { ok: false, message: t.errorRateLimited };
  }

  const parsed = RequestSchema.safeParse({
    orgName: formData.get("orgName"),
    orgKind: formData.get("orgKind"),
    contactName: formData.get("contactName"),
    workEmail: formData.get("workEmail"),
    city: formData.get("city"),
    state: formData.get("state"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { ok: false, message: t.errorInvalid };
  }

  const data = parsed.data;
  await prisma.partnerRequest.create({
    data: {
      orgName: data.orgName,
      orgKind: data.orgKind,
      contactName: data.contactName,
      workEmail: data.workEmail,
      city: data.city || null,
      state: data.state || null,
      message: data.message || null,
      ipHash: await clientIpHash(),
    },
  });

  await recordAudit({
    actorType: "SYSTEM",
    action: "partner.request_submitted",
    resourceType: "PartnerRequest",
    metadata: { orgKind: data.orgKind },
  });

  // Surface the queue to platform admins immediately — the review table on
  // /admin/platform is only useful if somebody knows it has new rows.
  const platformAdmins = await prisma.user.findMany({
    where: { role: "PLATFORM_ADMIN", status: "ACTIVE" },
    select: { id: true },
  });
  for (const admin of platformAdmins) {
    await dispatchDonorNotification({
      userId: admin.id,
      typeKey: "notify.partner.request",
      genericTitle: true,
      titleKey: "notify.genericUpdateTitle",
      bodyKey: "notify.genericUpdateBody",
    });
  }

  return { ok: true, message: t.successTitle };
}
