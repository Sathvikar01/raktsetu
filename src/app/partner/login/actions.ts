"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate } from "@/lib/services/account";

const LoginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200),
});

export async function partnerLoginAction(formData: FormData): Promise<void> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/partner/login?error=invalid");

  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    const code =
      result.reason === "RATE_LIMITED"
        ? "rate_limited"
        : result.reason === "DISABLED"
          ? "disabled"
          : "invalid";
    redirect(`/partner/login?error=${code}`);
  }

  // Partner portal is staff-only — donors must use the donor login.
  if (result.role === "DONOR") {
    redirect("/partner/login?error=not_staff");
  }

  if (result.role === "ORG_STAFF" || result.role === "ORG_ADMIN") redirect("/staff");
  if (result.role === "PLATFORM_ADMIN") redirect("/admin");
  redirect("/staff");
}
