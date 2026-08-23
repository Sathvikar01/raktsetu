"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { authenticate, registerDonor, type AuthFailure } from "@/lib/services/account";

const EMAIL = z.string().trim().min(3).max(254);

const LoginSchema = z.object({
  email: EMAIL,
  password: z.string().min(1).max(200),
});

const RegisterSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: EMAIL,
  password: z.string().min(10).max(200),
});

function roleDestination(role: string): string {
  if (role === "ORG_STAFF" || role === "ORG_ADMIN") return "/staff";
  if (role === "PLATFORM_ADMIN") return "/admin";
  return "/dashboard";
}

const REGISTER_ERROR_CODES: Record<AuthFailure, string> = {
  RATE_LIMITED: "rate_limited",
  EXISTS: "exists",
  WEAK_PASSWORD: "weak_password",
  INVALID: "invalid_email",
  DISABLED: "disabled",
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

  await createSession(result.userId);
  redirect(roleDestination(result.role));
}

export async function registerAction(formData: FormData): Promise<void> {
  const parsed = RegisterSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/register?error=weak_password");

  const registered = await registerDonor({
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: parsed.data.displayName,
  });
  if (!registered.ok) {
    redirect(`/register?error=${REGISTER_ERROR_CODES[registered.reason]}`);
  }

  const auth = await authenticate(parsed.data.email, parsed.data.password);
  if (!auth.ok) redirect("/login?error=invalid");

  await createSession(auth.userId);
  redirect("/dashboard");
}
