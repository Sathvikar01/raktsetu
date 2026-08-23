import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@/packages/ui";
import { DEFAULT_LOCALE, getDictionary, translate } from "@/i18n";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/packages/database/client";
import { fmtDateTime, fmtDate } from "../format";
import { revokeConsentAction } from "../actions";
import { DONOR_CONSENT_PURPOSES, type DonorConsentPurpose } from "../types";
import { NotificationPrefsForm } from "../components/NotificationPrefsForm";
import { ConsentGrantForm } from "../components/ConsentGrantForm";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.nav.settings };
}

type PurposeLabelKey =
  | "purposeLifecycleNotifications"
  | "purposeNotificationsEmail"
  | "purposeNotificationsDescriptive"
  | "purposeDataExport";

const PURPOSE_LABEL_KEYS: Record<DonorConsentPurpose, PurposeLabelKey> = {
  "account.lifecycle_notifications": "purposeLifecycleNotifications",
  "notifications.email": "purposeNotificationsEmail",
  "notifications.descriptive": "purposeNotificationsDescriptive",
  "data.export": "purposeDataExport",
};

function purposeLabel(purposeKey: string): string {
  const d = getDictionary();
  const labelKey = (PURPOSE_LABEL_KEYS as Record<string, PurposeLabelKey>)[purposeKey];
  return labelKey ? d.donor[labelKey] : purposeKey;
}

export default async function SettingsPage() {
  const user = await requireRole("DONOR");
  const d = getDictionary();

  const [prefs, consents] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
    prisma.consentRecord.findMany({
      where: { subjectType: "DONOR_PLATFORM", subjectRef: user.id },
      orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
    }),
  ]);

  const defaults = {
    inApp: prefs?.inApp ?? true,
    email: prefs?.email ?? true,
    sms: prefs?.sms ?? false,
    whatsapp: prefs?.whatsapp ?? false,
    push: prefs?.push ?? false,
    descriptiveContent: prefs?.descriptiveContent ?? false,
    locale: prefs?.locale ?? DEFAULT_LOCALE,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight text-ink">{d.nav.settings}</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{d.donor.prefsTitle}</CardTitle>
          </CardHeader>
          <CardBody>
            <NotificationPrefsForm defaults={defaults} />
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{d.donor.privacyConsents}</CardTitle>
            </CardHeader>
            <CardBody>
              {consents.length === 0 ? (
                <p className="text-sm text-ink-faint">{d.donor.consentEmpty}</p>
              ) : (
                <ul className="space-y-3">
                  {consents.map((record) => (
                    <li
                      key={record.id}
                      className="rounded-lg border border-ink/10 bg-white px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-ink">{purposeLabel(record.purposeKey)}</p>
                        {record.revokedAt ? (
                          <Badge tone="neutral">
                            {translate(DEFAULT_LOCALE, "donor.consentRevoked", {
                              date: fmtDate(record.revokedAt),
                            })}
                          </Badge>
                        ) : (
                          <Badge tone="teal">
                            <CheckCircle2 className="size-3" aria-hidden />
                            {d.donor.consentActiveBadge}
                          </Badge>
                        )}
                      </div>
                      <dl className="mt-1.5 space-y-0.5 text-xs text-ink-faint">
                        <div className="flex gap-1.5">
                          <dt className="font-medium">{d.donor.consentScope}:</dt>
                          <dd className="font-mono">{record.purposeKey}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="font-medium">{d.donor.consentVersion}:</dt>
                          <dd>{record.policyVersion}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="font-medium">{d.donor.consentGranted}:</dt>
                          <dd>{fmtDateTime(record.grantedAt)}</dd>
                        </div>
                      </dl>
                      {!record.revokedAt ? (
                        <form action={revokeConsentAction} className="mt-3">
                          <input type="hidden" name="consentId" value={record.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-crimson-600/30 bg-white px-3 py-1.5 text-sm font-medium text-crimson-700 transition-colors hover:border-crimson-600/60 hover:bg-crimson-50"
                          >
                            {d.donor.consentRevoke}
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{d.donor.consentGrantTitle}</CardTitle>
            </CardHeader>
            <CardBody>
              <ConsentGrantForm />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
