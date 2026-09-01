import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, Card, CardBody, CardHeader, CardTitle } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { loadOrCreateEnrollment, readMfaPendingUserId } from "@/lib/services/mfa";
import { MfaChallengeForm } from "../MfaChallengeForm";
import { MfaQr } from "../MfaQr";

export const metadata: Metadata = { title: "Set up MFA", robots: { index: false, follow: false } };

/**
 * First-time TOTP enrollment for privileged roles. Reachable only with a
 * valid pending-login cookie (password factor passed, no session yet).
 */
export default async function MfaEnrollPage() {
  const d = getDictionary();
  const userId = await readMfaPendingUserId();
  if (!userId) redirect("/partner/login");

  const enrollment = await loadOrCreateEnrollment(userId);
  if (!enrollment) redirect("/mfa/challenge");

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{d.mfa.enrollTitle}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-ink-soft">{d.mfa.enrollBody}</p>
          <div className="space-y-4">
            <MfaQr uri={enrollment.uri} />
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {d.mfa.manualKey}
              </p>
              <code className="block break-all rounded-lg border border-ink/10 bg-canvas px-3 py-2 font-mono text-sm text-ink">
                {enrollment.secret}
              </code>
            </div>
            <Alert type="info">{d.mfa.enrollNote}</Alert>
          </div>
          <div className="mt-6">
            <MfaChallengeForm mode="enroll" />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
