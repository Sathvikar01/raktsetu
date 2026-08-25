import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { readMfaPendingUserId } from "@/lib/services/mfa";
import { MfaChallengeForm } from "../MfaChallengeForm";

export default async function MfaChallengePage() {
  const d = getDictionary();
  const userId = await readMfaPendingUserId();
  if (!userId) redirect("/login");

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{d.mfa.challengeTitle}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-ink-soft">{d.mfa.challengeBody}</p>
          <MfaChallengeForm />
        </CardBody>
      </Card>
    </div>
  );
}
