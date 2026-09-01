import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { Alert, Input, Label } from "@/packages/ui";
import { PasswordField } from "@/packages/ui";
import { AuthShell } from "@/components/site/AuthShell";
import { SubmitButton } from "@/components/site/SubmitButton";
import { resetPasswordAction } from "./actions";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.auth.resetTitle, robots: { index: false, follow: false } };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const d = getDictionary();
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <AuthShell
        title={d.public.auth.resetTitle}
        subtitle={d.public.auth.resetSubtitle}
        footer={
          <Link
            href="/forgot-password"
            className="rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
          >
            {d.public.auth.forgotLinkAgain}
          </Link>
        }
      >
        <Alert type="error">{d.public.auth.resetInvalidToken}</Alert>
      </AuthShell>
    );
  }

  const errorMessage =
    error === "weak_password"
      ? d.public.auth.errWeakPassword
      : error === "invalid_token"
        ? d.public.auth.resetInvalidToken
        : null;

  return (
    <AuthShell
      title={d.public.auth.resetTitle}
      subtitle={d.public.auth.resetSubtitle}
      footer={
        <>
          {d.public.auth.haveAccount}{" "}
          <Link
            href="/login"
            className="rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
          >
            {d.common.signIn}
          </Link>
        </>
      }
    >
      {errorMessage ? (
        <div className="mb-5">
          <Alert type="error">{errorMessage}</Alert>
        </div>
      ) : null}
      <form action={resetPasswordAction} className="space-y-5">
        <input type="hidden" name="token" value={token} />
        <PasswordField
          name="password"
          label={d.public.auth.newPasswordLabel}
          autoComplete="new-password"
          required
          minLength={10}
          showLabel={d.public.auth.showPassword}
          hideLabel={d.public.auth.hidePassword}
        />
        <p className="text-xs leading-relaxed text-ink-faint">{d.public.auth.passwordPolicyHint}</p>
        <SubmitButton pendingLabel={d.common.loading}>{d.public.auth.resetSubmit}</SubmitButton>
      </form>
    </AuthShell>
  );
}
