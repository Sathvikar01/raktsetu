"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { authenticate, registerDonor, type AuthFailure } from "@/lib/services/account";
import { beginMfaChallenge, mfaEnrolled } from "@/lib/services/mfa";
import { destinationForRole } from "@/lib/auth/safe-path";

const EMAIL = z.string().trim().min(3).max(254);

const LoginSchema = z.object({
  email: EMAIL,
  password: z.string().min(1).max(200),
});

// Registration reports malformed addresses as invalid_email (M8), so the
// shape of the address matters here — login stays length-only on purpose.
const RegisterSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: EMAIL.email(),
  password: z.string().min(10).max(200),
});

function roleDestination(role: string, next?: FormData): string {
  return destinationForRole(role, next?.get("next") ?? undefined);
}

const REGISTER_ERROR_CODES: Record<AuthFailure, string> = {
  RATE_LIMITED: "rate_limited",
  EXISTS: "exists",
  WEAK_PASSWORD: "weak_password",
  INVALID: "invalid_email",
  DISABLED: "disabled",
  EMAIL_UNVERIFIED: "email_unverified",
};

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=invalid");

  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    const code =
      result.reason === "RATE_LIMITED"
        ? "rate_limited"
        : result.reason === "DISABLED"
          ? "disabled"
          : "invalid";
    redirect(`/login?error=${code}`);
  }

  // Admins must pass the second factor before any session exists.
  if (result.mfaRequired) {
    await beginMfaChallenge(result.userId);
    redirect((await mfaEnrolled(result.userId)) ? "/mfa/challenge" : "/mfa/enroll");
  }

  await createSession(result.userId);
  redirect(roleDestination(result.role, formData));
}

export async function registerAction(formData: FormData): Promise<void> {
  const parsed = RegisterSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    // Distinguish a malformed email from a too-weak password so the form
    // error matches the actual problem instead of always blaming the password.
    const emailIssue = parsed.error.issues.some((i) => i.path[0] === "email");
    redirect(`/register?error=${emailIssue ? "invalid_email" : "weak_password"}`);
  }

  const registered = await registerDonor({
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: parsed.data.displayName,
  });
  if (!registered.ok) {
    redirect(`/register?error=${REGISTER_ERROR_CODES[registered.reason]}`);
  }

  // registerDonor just verified the credentials it created — issue the single
  // valid session directly instead of re-running the password verifier.
  await createSession(registered.userId);
  redirect("/dashboard");
}
