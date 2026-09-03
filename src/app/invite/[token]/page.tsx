import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { Alert, Input, Label } from "@/packages/ui";
import { PasswordField } from "@/packages/ui";
import { AuthShell } from "@/components/site/AuthShell";
import { SubmitButton } from "@/components/site/SubmitButton";
import { getInvitePreview } from "@/lib/services/partner-onboarding";
import { acceptInviteAction } from "./actions";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.invite.title, robots: { index: false, follow: false } };
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const d = getDictionary();
  const { token } = await params;
  const { error } = await searchParams;

  const preview = await getInvitePreview(decodeURIComponent(token));
  if (!preview.valid || error === "invalid") {
    return (
      <AuthShell
        title={d.public.invite.title}
        subtitle={d.public.invite.subtitle}
        footer={
          <Link
            href="/login"
            className="rounded font-medium text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:underline"
          >
            {d.common.signIn}
          </Link>
        }
      >
        <Alert type="error">{d.public.invite.invalid}</Alert>
      </AuthShell>
    );
  }

  const validationError = error === "validation" ? d.public.invite.errValidation : null;

  return (
    <AuthShell
      title={d.public.invite.title}
      subtitle={d.public.invite.subtitleFor.replace("{org}", preview.orgName)}
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
      <p className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-800">
        {d.public.invite.invitedAs
          .replace("{email}", preview.email)
          .replace("{role}", preview.role === "ORG_STAFF" ? d.public.invite.roleStaff : d.public.invite.roleAdmin)}
      </p>
      {validationError ? (
        <div className="mb-5">
          <Alert type="error">{validationError}</Alert>
        </div>
      ) : null}
      <form action={acceptInviteAction} className="space-y-5">
        <input type="hidden" name="token" value={token} />
        <div>
          <Label htmlFor="invite-display-name">{d.common.displayName}</Label>
          <Input id="invite-display-name" name="displayName" required minLength={2} maxLength={80} autoComplete="name" />
        </div>
        <PasswordField
          name="password"
          label={d.public.auth.newPasswordLabel}
          autoComplete="new-password"
          required
          minLength={10}
          showLabel={d.public.auth.showPassword}
          hideLabel={d.public.auth.hidePassword}
        />
        <SubmitButton pendingLabel={d.common.loading}>{d.public.invite.accept}</SubmitButton>
      </form>
    </AuthShell>
  );
}
