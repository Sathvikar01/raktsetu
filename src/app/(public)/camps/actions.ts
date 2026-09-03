"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { clientIpFrom } from "@/lib/rate-limit";
import { registerForCamp } from "@/lib/services/camps";

/**
 * Public camp actions. Registration is allowed for signed-in donors (deduped
 * per account) and anonymous visitors (IP-throttled); phones are stored only
 * as keyed hashes.
 */

export interface CampRegisterState {
  ok: boolean;
  messageKey?: string;
}

const RegisterSchema = z.object({
  campId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  headcount: z.coerce.number().int().min(1).max(5),
});

export async function registerForCampAction(input: unknown): Promise<CampRegisterState> {
  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, messageKey: "camps.registerInvalid" };
  const user = await getSessionUser();
  if (!user && parsed.data.phone) {
    // Anonymous registrations keep a hashable phone only for organizer planning.
    const phone = parsed.data.phone;
    if (phone && !/^[+0-9\s\-().]{6,20}$/.test(phone)) {
      return { ok: false, messageKey: "camps.registerInvalid" };
    }
  }
  const h = await headers();
  const result = await registerForCamp({
    campId: parsed.data.campId,
    userId: user?.id ?? null,
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    headcount: parsed.data.headcount,
    ip: clientIpFrom(h),
  });
  return {
    ok: result.ok,
    messageKey: result.ok
      ? "camps.registerDone"
      : result.reason === "RATE_LIMITED"
        ? "camps.registerRateLimited"
        : result.reason === "CAMP_CLOSED"
          ? "camps.registerClosed"
          : "camps.registerInvalid",
  };
}
