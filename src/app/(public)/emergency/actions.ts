"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { clientIpFrom } from "@/lib/rate-limit";
import { issueOtp, verifyOtp } from "@/lib/services/otp";
import {
  createEmergencyRequest,
  cancelEmergencyRequest,
  confirmEmergencyRequestFulfilled,
} from "@/lib/services/emergency-requests";
import { OpsValidationError } from "@/lib/services/bloodbank-ops";
import { getSessionUser } from "@/lib/auth/session";
import { BLOOD_GROUPS, COMPONENT_TYPES } from "@/packages/schemas/events";

/**
 * Public emergency-request actions. No session required; the flow is gated by
 * mobile OTP possession, per-phone/IP rate limits and duplicate detection
 * inside the service. The verification token returned by verifyOtp travels
 * back to the client and is consumed exactly once at creation.
 */

export interface EmergencyOtpState {
  ok: boolean;
  reason?: "INVALID_PHONE" | "RATE_LIMITED" | "INVALID" | "EXPIRED" | "LOCKED" | "NOT_FOUND";
  retryAfterSec?: number;
  devCode?: string;
  messageKey?: string;
}

const otpPurpose = "EMERGENCY_REQUEST" as const;

export async function requestEmergencyOtpAction(phone: string): Promise<EmergencyOtpState> {
  const parsed = z.string().trim().min(6).max(20).safeParse(phone);
  if (!parsed.success) return { ok: false, reason: "INVALID_PHONE", messageKey: "emergency.otpInvalidPhone" };
  const h = await headers();
  const result = await issueOtp({
    purpose: otpPurpose,
    phone: parsed.data,
    ip: clientIpFrom(h),
  });
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      retryAfterSec: result.retryAfterSec,
      messageKey: result.reason === "INVALID_PHONE" ? "emergency.otpInvalidPhone" : "emergency.otpRateLimited",
    };
  }
  return { ok: true, devCode: result.devCode };
}

export interface EmergencyVerifyState extends EmergencyOtpState {
  verificationToken?: string;
}

const VERIFY_REASON_KEYS: Record<string, string> = {
  INVALID: "emergency.otpInvalid",
  EXPIRED: "emergency.otpExpired",
  LOCKED: "emergency.otpLocked",
  NOT_FOUND: "emergency.otpNotFound",
};

export async function verifyEmergencyOtpAction(phone: string, code: string): Promise<EmergencyVerifyState> {
  const parsed = z
    .object({ phone: z.string().trim().min(6).max(20), code: z.string().trim().regex(/^\d{6}$/) })
    .safeParse({ phone, code });
  if (!parsed.success) return { ok: false, reason: "INVALID", messageKey: "emergency.otpInvalid" };
  const result = await verifyOtp({ purpose: otpPurpose, phone: parsed.data.phone, code: parsed.data.code });
  if (!result.ok || !result.verificationToken) {
    return {
      ok: false,
      reason: result.reason,
      messageKey: VERIFY_REASON_KEYS[result.reason ?? "INVALID"] ?? "emergency.otpInvalid",
    };
  }
  return { ok: true, verificationToken: result.verificationToken };
}

export interface CreateEmergencyState {
  ok: boolean;
  messageKey?: string;
  publicToken?: string;
  requestNumber?: string;
}

const CreateSchema = z.object({
  componentType: z.enum(COMPONENT_TYPES),
  bloodGroup: z.enum(BLOOD_GROUPS),
  unitsRequested: z.coerce.number().int().min(1).max(10),
  urgency: z.enum(["ROUTINE", "URGENT", "EMERGENCY"]),
  hospitalName: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(80),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z.string().trim().min(6).max(20),
  verificationToken: z.string().trim().min(16).max(128),
});

export async function createEmergencyRequestAction(
  input: unknown
): Promise<CreateEmergencyState> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, messageKey: "emergency.errValidation" };
  if (parsed.data.componentType === "OTHER") {
    return { ok: false, messageKey: "emergency.errValidation" };
  }

  const h = await headers();
  const user = await getSessionUser();
  try {
    const created = await createEmergencyRequest({
      ...parsed.data,
      requesterUserId: user?.id ?? null,
      ip: clientIpFrom(h),
    });
    return {
      ok: true,
      publicToken: created.publicToken,
      requestNumber: created.requestNumber,
    };
  } catch (err) {
    if (err instanceof OpsValidationError) {
      const reason = err.message;
      if (reason === "DUPLICATE_ACTIVE") return { ok: false, messageKey: "emergency.errDuplicate" };
      if (reason === "RATE_LIMITED") return { ok: false, messageKey: "emergency.errRateLimited" };
      if (reason === "PHONE_NOT_VERIFIED") return { ok: false, messageKey: "emergency.errNotVerified" };
    }
    return { ok: false, messageKey: "emergency.errGeneric" };
  }
}

/** Requester controls — authorized by publicToken possession (capability URL). */
export async function confirmEmergencyFulfilledAction(
  publicToken: string
): Promise<{ ok: boolean; messageKey?: string }> {
  const parsed = z.string().trim().min(16).max(128).safeParse(publicToken);
  if (!parsed.success) return { ok: false, messageKey: "emergency.errGeneric" };
  const result = await confirmEmergencyRequestFulfilled({ publicToken: parsed.data });
  return {
    ok: result.ok,
    messageKey: result.ok ? "emergency.fulfilledConfirmed" : "emergency.errGeneric",
  };
}

export async function cancelEmergencyRequestAction(
  publicToken: string
): Promise<{ ok: boolean; messageKey?: string }> {
  const parsed = z.string().trim().min(16).max(128).safeParse(publicToken);
  if (!parsed.success) return { ok: false, messageKey: "emergency.errGeneric" };
  const result = await cancelEmergencyRequest({ publicToken: parsed.data });
  return {
    ok: result.ok,
    messageKey: result.ok ? "emergency.cancelledConfirmed" : "emergency.errGeneric",
  };
}
