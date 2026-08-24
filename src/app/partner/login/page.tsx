import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Input, Label } from "@/packages/ui";
import { PasswordField } from "@/packages/ui";
import { AuthShell } from "@/components/site/AuthShell";
import { SubmitButton } from "@/components/site/SubmitButton";
import { partnerLoginAction } from "./actions";

export const metadata: Metadata = {
  title: "Partner login — RaktSetu",
  description: "Separate login for verified blood bank and hospital staff.",
};

const ERROR_TEXT: Record<string, string> = {
  invalid: "Check your email and password and try again.",
  rate_limited: "Too many attempts — please wait a minute and try again.",
  disabled: "This account is disabled. Contact your organisation admin.",
  not_staff: "This portal is for hospital / blood-bank staff only. Donors, please use the main login.",
};

export default async function PartnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const msg = error ? ERROR_TEXT[error] ?? null : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-md">
        <div className="mb-6 rounded-xl border border-amber-600/20 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <strong className="font-semibold">Hospital / NGO staff only.</strong> Donors sign in at{" "}
          <Link href="/login" className="font-medium text-amber-700 underline-offset-4 hover:underline">
            /login
          </Link>
          .
        </div>
        <AuthShell
          title="Partner login"
          subtitle="Blood bank and hospital staff — use your organisation credentials. Code generation is automatic after you record a donation."
          footer={
            <>
              Need access?{" "}
              <Link
                href="/partners"
                className="rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline"
              >
                Request partner access
              </Link>
              {" · "}
              <Link href="/" className="font-medium text-ink-soft hover:text-ink hover:underline">
                Donor site
              </Link>
            </>
          }
        >
          {msg ? (
            <div className="mb-5">
              <Alert type="error">{msg}</Alert>
            </div>
          ) : null}
          <form action={partnerLoginAction} className="space-y-5">
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required error={error === "invalid"} />
            </div>
            <PasswordField
              name="password"
              label="Password"
              autoComplete="current-password"
              required
              showLabel="Show"
              hideLabel="Hide"
            />
            <SubmitButton pendingLabel="Signing in…">Sign in to partner portal</SubmitButton>
          </form>
        </AuthShell>
      </div>
    </div>
  );
}
