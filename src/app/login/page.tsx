import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { Alert, Input, Label } from "@/packages/ui";
import { PasswordField } from "@/packages/ui";
import { AuthShell } from "@/components/site/AuthShell";
import { SubmitButton } from "@/components/site/SubmitButton";
import { loginAction } from "@/app/(auth)/actions";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.auth.loginTitle, description: d.public.auth.loginSubtitle };
}

const ERROR_KEYS = {
  invalid: "errInvalid",
  rate_limited: "errRateLimited",
  disabled: "errDisabled",
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const d = getDictionary();
  const { error, reset } = await searchParams;
  const errorMessage =
    error && error in ERROR_KEYS
      ? d.public.auth[ERROR_KEYS[error as keyof typeof ERROR_KEYS]]
      : null;

  return (
    <AuthShell
      title={d.public.auth.loginTitle}
      subtitle={d.public.auth.loginSubtitle}
      footer={
        <>
          {d.public.auth.needAccount}{" "}
          <Link
            href="/register"
            className="rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
          >
            {d.common.signUp}
          </Link>
        </>
      }
    >
      {reset ? (
        <div className="mb-5">
          <Alert type="success">{d.public.auth.loginResetSuccess}</Alert>
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-5">
          <Alert type="error">{errorMessage}</Alert>
        </div>
      ) : null}
      <form action={loginAction} className="space-y-5">
        <div>
          <Label htmlFor="email">{d.common.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            error={error === "invalid"}
          />
        </div>
        <PasswordField
          name="password"
          label={d.common.password}
          autoComplete="current-password"
          required
          showLabel={d.public.auth.showPassword}
          hideLabel={d.public.auth.hidePassword}
        />
        <SubmitButton pendingLabel={d.common.loading}>{d.common.signIn}</SubmitButton>
        <p className="text-center text-sm">
          <Link
            href="/forgot-password"
            className="rounded font-medium text-ink-soft underline-offset-4 hover:text-teal-700 hover:underline focus-visible:underline"
          >
            {d.public.auth.forgotTitle}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
