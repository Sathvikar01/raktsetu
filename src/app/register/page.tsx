import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { Alert, Input, Label } from "@/packages/ui";
import { PasswordField } from "@/packages/ui";
import { AuthShell } from "@/components/site/AuthShell";
import { SubmitButton } from "@/components/site/SubmitButton";
import { registerAction } from "@/app/(auth)/actions";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.auth.registerTitle, description: d.public.auth.registerSubtitle, robots: { index: false, follow: false } };
}

const ERROR_KEYS = {
  invalid_email: "errInvalidEmail",
  weak_password: "errWeakPassword",
  exists: "errExists",
  rate_limited: "errRateLimited",
  disabled: "errDisabled",
} as const;

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const d = getDictionary();
  const { error } = await searchParams;
  const errorMessage =
    error && error in ERROR_KEYS
      ? d.public.auth[ERROR_KEYS[error as keyof typeof ERROR_KEYS]]
      : null;

  return (
    <AuthShell
      title={d.public.auth.registerTitle}
      subtitle={d.public.auth.registerSubtitle}
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
      {/* noValidate: server-side branching (invalid_email vs weak_password) is
          the error UX — native bubbles would block submit before it runs. */}
      <form action={registerAction} className="space-y-5" noValidate>
        <div>
          <Label htmlFor="displayName">{d.common.displayName}</Label>
          <Input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            maxLength={80}
            required
          />
        </div>
        <div>
          <Label htmlFor="email">{d.common.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            error={error === "invalid_email" || error === "exists"}
          />
        </div>
        <PasswordField
          name="password"
          label={d.common.password}
          autoComplete="new-password"
          required
          minLength={10}
          showLabel={d.public.auth.showPassword}
          hideLabel={d.public.auth.hidePassword}
          hintLength={d.public.auth.passwordHintLength}
          hintMixed={d.public.auth.passwordHintMixed}
        />
        <p className="text-xs leading-relaxed text-ink-faint">{d.public.auth.registerNote}</p>
        <SubmitButton pendingLabel={d.common.loading}>{d.common.signUp}</SubmitButton>
      </form>
    </AuthShell>
  );
}
