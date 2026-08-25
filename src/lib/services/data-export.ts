import "server-only";
/**
 * Donor data export (DPDP/GDPR art. 15 style access right).
 * PI-1 hard rule: this export NEVER touches RecipientContext, recipientRef,
 * ageBand or treatmentCategory. Only whitelisted coarse provenance fields are
 * included for disclosure views.
 */
import { prisma } from "@/packages/database/client";

export interface DonorDataExport {
  meta: {
    exportedAt: string;
    version: number;
    privacyNote: string;
  };
  profile: {
    email: string;
    displayName: string;
    bloodGroup: string | null;
    birthYear: number | null;
    preferredLocale: string;
    memberSince: string;
  } | null;
  donations: Array<{
    id: string;
    externalDonationId: string;
    din: string | null;
    donatedAt: string;
    linkStatus: string;
    linkCode: string;
    components: Array<{
      id: string;
      componentType: string;
      externalComponentId: string | null;
      currentDerivedState: string;
      preparedAt: string | null;
    }>;
  }>;
  consents: Array<{
    purposeKey: string;
    granted: boolean;
    policyVersion: string;
    grantedAt: string;
    revokedAt: string | null;
  }>;
  notificationPreference: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
    descriptiveContent: boolean;
    locale: string;
  } | null;
  recentNotifications: Array<{
    typeKey: string;
    readAt: string | null;
    createdAt: string;
  }>;
  disclosureViews: Array<{
    componentId: string;
    grantedLevel: string;
    messageKey: string;
    degradedReason: string | null;
    organizationName: string | null;
    sourceSystem: string;
    sourceEventId: string;
    eventDate: string;
  }>;
}

const PRIVACY_NOTE =
  "Recipient identity is structurally absent from this system and never appears in exports. No medical test results are stored. Event dates are day-granularity.";

/** Latest VERIFIED transfusion decision per component, whitelisted fields only. */
async function loadDisclosureViews(componentIds: string[]): Promise<DonorDataExport["disclosureViews"]> {
  if (componentIds.length === 0) return [];
  const events = await prisma.lifecycleEvent.findMany({
    where: {
      componentId: { in: componentIds },
      eventType: "COMPONENT_TRANSFUSED",
      verificationStatus: "VERIFIED",
      supersededByCorrection: false,
    },
    orderBy: [{ occurredAt: "desc" }, { receivedAt: "desc" }],
    select: {
      componentId: true,
      occurredAt: true,
      sourceSystem: true,
      sourceEventId: true,
      organization: { select: { name: true } },
      disclosureDecisions: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { grantedLevel: true, messageKey: true, degradedReason: true },
      },
    },
  });

  const seen = new Set<string>();
  const views: DonorDataExport["disclosureViews"] = [];
  for (const e of events) {
    if (!e.componentId || seen.has(e.componentId)) continue;
    seen.add(e.componentId);
    const decision = e.disclosureDecisions[0];
    if (!decision) continue;
    views.push({
      componentId: e.componentId,
      grantedLevel: decision.grantedLevel,
      messageKey: decision.messageKey,
      degradedReason: decision.degradedReason ?? null,
      organizationName: e.organization?.name ?? null,
      sourceSystem: e.sourceSystem,
      sourceEventId: e.sourceEventId,
      eventDate: e.occurredAt.toISOString().slice(0, 10),
    });
  }
  return views;
}

export async function buildDonorDataExport(userId: string): Promise<DonorDataExport> {
  const profile = await prisma.donorProfile.findUnique({
    where: { userId },
    select: {
      bloodGroup: true,
      birthYear: true,
      preferredLocale: true,
      user: { select: { email: true, displayName: true, createdAt: true } },
      donations: {
        orderBy: { donatedAt: "desc" },
        select: {
          id: true,
          externalDonationId: true,
          din: true,
          donatedAt: true,
          linkStatus: true,
          linkCode: true,
          components: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              componentType: true,
              externalComponentId: true,
              currentDerivedState: true,
              preparedAt: true,
            },
          },
        },
      },
    },
  });

  const [user, consents, prefs, notifications] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, createdAt: true },
    }),
    prisma.consentRecord.findMany({
      where: { subjectType: "DONOR_PLATFORM", subjectRef: userId },
      orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
      select: {
        purposeKey: true,
        granted: true,
        policyVersion: true,
        grantedAt: true,
        revokedAt: true,
      },
    }),
    prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        inApp: true,
        email: true,
        sms: true,
        whatsapp: true,
        push: true,
        descriptiveContent: true,
        locale: true,
      },
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: { typeKey: true, readAt: true, createdAt: true },
    }),
  ]);

  const componentIds = profile
    ? profile.donations.flatMap((d) => d.components.map((c) => c.id))
    : [];
  const disclosureViews = await loadDisclosureViews(componentIds);

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      version: 1,
      privacyNote: PRIVACY_NOTE,
    },
    profile: profile
      ? {
          email: profile.user.email,
          displayName: profile.user.displayName,
          bloodGroup: profile.bloodGroup,
          birthYear: profile.birthYear,
          preferredLocale: profile.preferredLocale,
          memberSince: profile.user.createdAt.toISOString(),
        }
      : null,
    donations: (profile?.donations ?? []).map((d) => ({
      id: d.id,
      externalDonationId: d.externalDonationId,
      din: d.din,
      donatedAt: d.donatedAt.toISOString(),
      linkStatus: d.linkStatus,
      linkCode: d.linkCode,
      components: d.components.map((c) => ({
        id: c.id,
        componentType: c.componentType,
        externalComponentId: c.externalComponentId,
        currentDerivedState: c.currentDerivedState,
        preparedAt: c.preparedAt ? c.preparedAt.toISOString() : null,
      })),
    })),
    consents: consents.map((c) => ({
      purposeKey: c.purposeKey,
      granted: c.granted,
      policyVersion: c.policyVersion,
      grantedAt: c.grantedAt.toISOString(),
      revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
    })),
    notificationPreference: prefs ?? null,
    recentNotifications: notifications.map((n) => ({
      typeKey: n.typeKey,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
    disclosureViews,
  };
}
