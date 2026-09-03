import type { Metadata } from "next";
import { requireRole } from "@/lib/rbac";
import { getDictionary } from "@/i18n";
import { listDonorMatches } from "@/lib/services/emergency-requests";
import { prisma } from "@/packages/database/client";
import { EmergencyMatchList } from "../components/EmergencyMatchList";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.donor.matchesTitle };
}

export default async function DonorRequestsPage() {
  const user = await requireRole("DONOR");
  const d = getDictionary();

  const matches = user.donorProfileId ? await listDonorMatches(user.donorProfileId) : [];

  // Donors without network onboarding land here with an empty queue — point
  // them at settings where the network card lives.
  const onboarded = user.donorProfileId
    ? await prisma.donorProfile.findUnique({
        where: { id: user.donorProfileId },
        select: { onboardedAt: true, available: true, phoneVerifiedAt: true },
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{d.donor.matchesTitle}</h1>
        <p className="mt-1 text-sm text-ink-soft">{d.donor.matchesIntro}</p>
      </div>
      {onboarded && !onboarded.available ? (
        <p className="rounded-lg border border-amber-600/25 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {d.donor.networkPaused}
        </p>
      ) : onboarded && !onboarded.phoneVerifiedAt ? (
        <p className="rounded-lg border border-amber-600/25 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {d.donor.networkPhoneRequired}
        </p>
      ) : null}
      <EmergencyMatchList matches={matches} />
    </div>
  );
}
