"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate } from "@/lib/services/account";
import { createSession } from "@/lib/auth/session";
import { beginMfaChallenge, mfaEnrolled } from "@/lib/services/mfa";

const LoginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200),
});

const STAFF_ROLES = ["ORG_STAFF", "ORG_ADMIN", "PLATFORM_ADMIN"] as const;

export async function partnerLoginAction(formData: FormData): Promise<void> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/partner/login?error=invalid");

  // expectRole keeps donor credentials from ever opening a session here.
  const result = await authenticate(parsed.data.email, parsed.data.password, {
    expectRole: [...STAFF_ROLES],
  });
  if (result.ok && result.mfaRequired) {
    await beginMfaChallenge(result.userId);
    redirect((await mfaEnrolled(result.userId)) ? "/mfa/challenge" : "/mfa/enroll");
  }
  if (!result.ok) {
    const code =
      result.reason === "RATE_LIMITED"
        ? "rate_limited"
        : result.reason === "DISABLED"
          ? "disabled"
          : result.reason === "EMAIL_UNVERIFIED"
            ? "email_unverified"
            : "invalid";
    redirect(`/partner/login?error=${code}`);
  }

  // A successful login must always yield exactly one valid session —
  // createSession also revokes any prior session for the account.
  await createSession(result.userId);

  if (result.role === "PLATFORM_ADMIN") redirect("/admin");
  redirect("/staff");
}
