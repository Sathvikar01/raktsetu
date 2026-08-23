"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDictionary } from "@/i18n";
import { can, ForbiddenError, requireRole } from "@/lib/rbac";
import { prisma } from "@/packages/database/client";
import { logout } from "@/lib/services/account";
import {
  completeProcessing,
  createComponents,
  markComponentDiscarded,
  markComponentExpired,
  OpsValidationError,
  recordDonation,
  transferComponent,
} from "@/lib/services/bloodbank-ops";
import {
  discardComponent,
  issueComponent,
  receiveComponent,
  returnComponent,
  transfuseComponent,
} from "@/lib/services/hospital-ops";
import { AGE_BANDS, COMPONENT_TYPES, DISCLOSURE_LEVELS, TREATMENT_CATEGORIES } from "@/packages/schemas/events";
import type { OpsActionState } from "./types";
import { gateOrgMembership, opsFailure, optionalStr, parseDateTimeLocal, str } from "./shared";

/**
 * Staff portal server actions. Deny-by-default: every action runs
 * requireRole(...) first, then an ACTIVE-membership org gate; ops services
 * authorize again inside ingestEvent() (defense in depth).
 */

function parsed<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new OpsValidationError("Invalid form values");
  return result.data;
}

async function staffGate(orgId: string): Promise<string> {
  const user = await requireRole("ORG_STAFF", "ORG_ADMIN", "PLATFORM_ADMIN");
  if (!(await gateOrgMembership(orgId))) throw new ForbiddenError();
  return user.id;
}

// ---------------------------------------------------------------------------
// Blood-bank operations
// ---------------------------------------------------------------------------

export async function recordDonationAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  const organizationId = str(formData, "organizationId");
  let userId: string;
  try {
    userId = await staffGate(organizationId);
  } catch (err) {
    return opsFailure(err);
  }
  try {
    const input = parsed(
      z.object({
        externalDonationId: z.string().trim().min(1).max(128),
        din: z.string().trim().max(64),
        facilityCode: z.string().trim().max(64),
      }),
      {
        externalDonationId: formData.get("externalDonationId"),
        din: formData.get("din") ?? "",
        facilityCode: formData.get("facilityCode") ?? "",
      }
    );
    const donatedAt = parseDateTimeLocal(str(formData, "donatedAt"));
    const result = await recordDonation(
      {
        organizationId,
        externalDonationId: input.externalDonationId,
        din: input.din || null,
        donatedAt,
        facilityCode: input.facilityCode || null,
      },
      { ingestedByUserId: userId }
    );
    revalidatePath("/staff");
    return {
      ok: true,
      message: getDictionary().staff.donationRecorded,
      linkCode: result.linkCode,
    };
  } catch (err) {
    return opsFailure(err);
  }
}

export async function completeProcessingAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  const organizationId = str(formData, "organizationId");
  let userId: string;
  try {
    userId = await staffGate(organizationId);
  } catch (err) {
    return opsFailure(err);
  }
  try {
    const donationId = parsed(z.string().uuid(), str(formData, "donationId"));
    await completeProcessing({ organizationId, donationId }, { ingestedByUserId: userId });
    revalidatePath("/staff");
    return { ok: true, message: getDictionary().staff.processingDone };
  } catch (err) {
    return opsFailure(err);
  }
}

export async function createComponentsAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  const organizationId = str(formData, "organizationId");
  let userId: string;
  try {
    userId = await staffGate(organizationId);
  } catch (err) {
    return opsFailure(err);
  }
  try {
    const donationId = parsed(z.string().uuid(), str(formData, "donationId"));
    const rowCount = Math.min(Math.max(Number(str(formData, "rowCount")) || 0, 0), 8);
    const rows: Array<{ componentType: string; externalComponentId: string }> = [];
    for (let i = 0; i < rowCount; i += 1) {
      const type = str(formData, `compType_${i}`);
      const ext = str(formData, `compExt_${i}`);
      if (type || ext) rows.push({ componentType: type, externalComponentId: ext });
    }
    const components = parsed(
      z
        .array(
          z.object({
            componentType: z.enum(COMPONENT_TYPES),
            externalComponentId: z.string().trim().min(1).max(128),
          })
        )
        .min(1),
      rows
    );
    await createComponents({ organizationId, donationId, components }, { ingestedByUserId: userId });
    revalidatePath("/staff");
    return {
      ok: true,
      message: getDictionary().staff.componentsCreatedCount.replace("{count}", String(components.length)),
    };
  } catch (err) {
    return opsFailure(err);
  }
}

export async function transferComponentAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  const organizationId = str(formData, "organizationId");
  let userId: string;
  try {
    userId = await staffGate(organizationId);
  } catch (err) {
    return opsFailure(err);
  }
  try {
    const input = parsed(
      z.object({
        componentId: z.string().uuid(),
        destinationFacilityExternalCode: z.string().trim().min(1).max(64),
      }),
      {
        componentId: str(formData, "componentId"),
        destinationFacilityExternalCode: str(formData, "destinationFacilityExternalCode"),
      }
    );
    await transferComponent({ organizationId, ...input }, { ingestedByUserId: userId });
    revalidatePath("/staff");
    return { ok: true, message: getDictionary().staff.transferDone };
  } catch (err) {
    return opsFailure(err);
  }
}

async function terminalAction(
  formData: FormData,
  kind: "expired" | "discarded"
): Promise<OpsActionState> {
  const organizationId = str(formData, "organizationId");
  let userId: string;
  try {
    userId = await staffGate(organizationId);
  } catch (err) {
    return opsFailure(err);
  }
  try {
    const input = parsed(
      z.object({ componentId: z.string().uuid(), reason: z.string().trim().max(200) }),
      { componentId: str(formData, "componentId"), reason: formData.get("reason") ?? "" }
    );
    const payload = {
      organizationId,
      componentId: input.componentId,
      reason: input.reason || null,
    };
    if (kind === "expired") {
      await markComponentExpired(payload, { ingestedByUserId: userId });
    } else {
      await markComponentDiscarded(payload, { ingestedByUserId: userId });
    }
    revalidatePath("/staff");
    return { ok: true, message: getDictionary().staff.terminalDone };
  } catch (err) {
    return opsFailure(err);
  }
}

export async function markComponentExpiredAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  return terminalAction(formData, "expired");
}

export async function markComponentDiscardedAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  return terminalAction(formData, "discarded");
}

// ---------------------------------------------------------------------------
// Hospital operations
// ---------------------------------------------------------------------------

async function hospitalActionBase(formData: FormData): Promise<{ organizationId: string; userId: string }> {
  const organizationId = str(formData, "organizationId");
  const userId = await staffGate(organizationId);
  return { organizationId, userId };
}

export async function hospitalReceiveComponentAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  let ctx: { organizationId: string; userId: string };
  try {
    ctx = await hospitalActionBase(formData);
  } catch (err) {
    return opsFailure(err);
  }
  try {
    const componentId = parsed(z.string().uuid(), str(formData, "componentId"));
    await receiveComponent({ organizationId: ctx.organizationId, componentId }, { ingestedByUserId: ctx.userId });
    revalidatePath("/staff");
    return { ok: true, message: getDictionary().staff.receiveDone };
  } catch (err) {
    return opsFailure(err);
  }
}

export async function hospitalIssueComponentAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  let ctx: { organizationId: string; userId: string };
  try {
    ctx = await hospitalActionBase(formData);
  } catch (err) {
    return opsFailure(err);
  }
  try {
    const input = parsed(
      z.object({ componentId: z.string().uuid(), issuedToRef: z.string().trim().max(64) }),
      { componentId: str(formData, "componentId"), issuedToRef: str(formData, "issuedToRef") }
    );
    await issueComponent(
      { organizationId: ctx.organizationId, componentId: input.componentId, issuedToRef: input.issuedToRef || null },
      { ingestedByUserId: ctx.userId }
    );
    revalidatePath("/staff");
    return { ok: true, message: getDictionary().staff.issueDone };
  } catch (err) {
    return opsFailure(err);
  }
}

export async function hospitalReturnComponentAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  let ctx: { organizationId: string; userId: string };
  try {
    ctx = await hospitalActionBase(formData);
  } catch (err) {
    return opsFailure(err);
  }
  try {
    const input = parsed(
      z.object({ componentId: z.string().uuid(), reason: z.string().trim().max(200) }),
      { componentId: str(formData, "componentId"), reason: formData.get("reason") ?? "" }
    );
    await returnComponent(
      { organizationId: ctx.organizationId, componentId: input.componentId, reason: input.reason || null },
      { ingestedByUserId: ctx.userId }
    );
    revalidatePath("/staff");
    return { ok: true, message: getDictionary().staff.returnDone };
  } catch (err) {
    return opsFailure(err);
  }
}

export async function hospitalDiscardComponentAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  let ctx: { organizationId: string; userId: string };
  try {
    ctx = await hospitalActionBase(formData);
  } catch (err) {
    return opsFailure(err);
  }
  try {
    const input = parsed(
      z.object({ componentId: z.string().uuid(), reason: z.string().trim().max(200) }),
      { componentId: str(formData, "componentId"), reason: formData.get("reason") ?? "" }
    );
    await discardComponent(
      { organizationId: ctx.organizationId, componentId: input.componentId, reason: input.reason || null },
      { ingestedByUserId: ctx.userId }
    );
    revalidatePath("/staff");
    return { ok: true, message: getDictionary().staff.discardDone };
  } catch (err) {
    return opsFailure(err);
  }
}

export async function hospitalTransfuseComponentAction(
  _prev: OpsActionState | null,
  formData: FormData
): Promise<OpsActionState> {
  let ctx: { organizationId: string; userId: string };
  try {
    ctx = await hospitalActionBase(formData);
  } catch (err) {
    return opsFailure(err);
  }
  try {
    const componentId = parsed(z.string().uuid(), str(formData, "componentId"));
    const level = parsed(z.enum(DISCLOSURE_LEVELS), str(formData, "level") || "NONE");
    const recipientRef = str(formData, "recipientRef");
    // Opaque local token only: [A-Za-z0-9_-], 8..64 chars (wire contract).
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(recipientRef)) {
      throw new OpsValidationError("recipient_ref format invalid");
    }
    const categoryRaw = optionalStr(formData, "category");
    if (level !== "NONE" && !categoryRaw) {
      throw new OpsValidationError("treatment category required above minimal disclosure");
    }
    const category = categoryRaw ? parsed(z.enum(TREATMENT_CATEGORIES), categoryRaw) : undefined;
    const ageBandRaw = optionalStr(formData, "ageBand");
    const ageBand = ageBandRaw ? parsed(z.enum(AGE_BANDS), ageBandRaw) : undefined;
    const consent = formData.get("patient_consent_verified") === "on";
    if (level === "BROAD_PURPOSE" && !consent) {
      throw new OpsValidationError("broad purpose requires verified consent");
    }

    await transfuseComponent(
      {
        organizationId: ctx.organizationId,
        componentId,
        disclosure: {
          level,
          ...(category ? { category } : {}),
          ...(ageBand ? { age_band: ageBand } : {}),
          recipient_ref: recipientRef,
          patient_consent_verified: consent,
        },
      },
      { ingestedByUserId: ctx.userId }
    );
    revalidatePath("/staff");
    return { ok: true, message: getDictionary().staff.transfuseDone };
  } catch (err) {
    return opsFailure(err);
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function signOutStaffAction(): Promise<void> {
  await logout();
  redirect("/");
}
