import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { Alert, Input, Label } from "@/packages/ui";
import { AuthShell } from "@/components/site/AuthShell";
import { SubmitButton } from "@/components/site/SubmitButton";
import { forgotPasswordAction } from "./actions";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.public.auth.forgotTitle, robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const d = getDictionary();
  const { sent } = await searchParams;

  return (
    <AuthShell
      title={d.public.auth.forgotTitle}
      subtitle={d.public.auth.forgotSubtitle}
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
      {sent ? (
        <div className="mb-5">
          <Alert type="success">{d.public.auth.forgotSent}</Alert>
        </div>
      ) : null}
      <form action={forgotPasswordAction} className="space-y-5">
        <div>
          <Label htmlFor="email">{d.common.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <SubmitButton pendingLabel={d.common.loading}>{d.public.auth.forgotSubmit}</SubmitButton>
      </form>
    </AuthShell>
  );
}
