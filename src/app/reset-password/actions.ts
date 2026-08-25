"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resetPassword } from "@/lib/services/password-reset";

async function clientIpHash(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256").update(`rs-ip:${ip}`).digest("hex").slice(0, 32);
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await resetPassword(token, password, await clientIpHash());

  if (!result.ok) {
    const reason = result.reason === "WEAK_PASSWORD" ? "weak_password" : "invalid_token";
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${reason}`);
  }
  redirect("/login?reset=1");
}
