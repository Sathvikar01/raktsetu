import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { Alert, buttonClasses, Card, CardBody } from "@/packages/ui";
import { verifyEmail } from "@/lib/services/email-verification";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const d = getDictionary();
  const { token } = await searchParams;

  const result = token ? await verifyEmail(token) : { ok: false as const };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-5 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {d.public.auth.verifyTitle}
          </h1>
          {result.ok ? (
            <>
              <Alert type="success">{d.public.auth.verifySuccess}</Alert>
              <Link href="/dashboard" className={buttonClasses("primary", "md")}>
                {d.nav.dashboard}
              </Link>
            </>
          ) : (
            <>
              <Alert type="error">{d.public.auth.verifyInvalid}</Alert>
              <Link href="/login" className={buttonClasses("secondary", "md")}>
                {d.common.signIn}
              </Link>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
