"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { rateLimitPersistent } from "@/lib/rate-limit";
import { acceptOrgInvite } from "@/lib/services/partner-onboarding";

async function clientIpHash(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256").update(`rs-ip:${ip}`).digest("hex").slice(0, 32);
}

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const password = String(formData.get("password") ?? "");

  const rl = await rateLimitPersistent(
    `invite-accept:${(await clientIpHash()) ?? "unknown"}`,
    10,
    15 * 60_000,
    { failClosed: true }
  );
  if (!rl.ok) redirect(`/invite/${encodeURIComponent(token)}?error=invalid`);

  const result = await acceptOrgInvite(token, displayName, password);
  if (!result.ok) {
    const reason = result.reason === "VALIDATION" ? "validation" : "invalid";
    redirect(`/invite/${encodeURIComponent(token)}?error=${reason}`);
  }
  await createSession(result.userId);
  redirect("/staff");
}
