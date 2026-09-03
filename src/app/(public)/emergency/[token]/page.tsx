import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { getPublicEmergencyStatus } from "@/lib/services/emergency-requests";
import { EmergencyStatusView } from "./EmergencyStatusView";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.emergency.metaTitle, robots: { index: false, follow: false } };
}

export default async function EmergencyStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const d = getDictionary();
  const { token } = await params;
  const status = await getPublicEmergencyStatus(token);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      {status ? (
        <EmergencyStatusView token={token} initial={status} />
      ) : (
        <Alert type="error" title={d.emergency.errorTitle}>
          {d.emergency.errorBody}
        </Alert>
      )}
      <p className="text-xs leading-relaxed text-ink-faint">
        {d.emergency.disclaimerBody}{" "}
        <Link href="/emergency" className="underline underline-offset-4">
          {d.emergency.navLabel}
        </Link>
      </p>
    </div>
  );
}
