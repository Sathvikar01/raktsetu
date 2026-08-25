"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestPasswordReset } from "@/lib/services/password-reset";

/** Coarse one-way hash of the client IP — enough for audit correlation. */
async function clientIpHash(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256").update(`rs-ip:${ip}`).digest("hex").slice(0, 32);
}

export async function forgotPasswordAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  await requestPasswordReset(email, await clientIpHash());
  redirect("/forgot-password?sent=1");
}
