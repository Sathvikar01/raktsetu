import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, StatTile, Table, TBody, TD, TH, THead, TR } from "@/packages/ui";
import { getDictionary, translate, DEFAULT_LOCALE } from "@/i18n";
import { prisma } from "@/packages/database/client";
import { requireRole } from "@/lib/rbac";
import { approvePartnerRequestAction, setOrgStatusAction, rejectPartnerRequestAction, approveCampAction, rejectCampAction, setEmergencyModerationAction } from "../actions";
import { CsrfInput } from "@/components/site/CsrfInput";
import { listCampsForModeration } from "@/lib/services/camps";
import { listFlaggedEmergencyRequests } from "@/lib/services/emergency-requests";

export const metadata: Metadata = { title: "Platform organizations" };

const STATUS_LABEL = {
  ACTIVE: "statusACTIVE",
  SUSPENDED: "statusSUSPENDED",
  PENDING_APPROVAL: "statusPENDING_APPROVAL",
} as const;

const PARTNER_STATUS_TONE = {
  PENDING: "amber",
  APPROVED: "teal",
  REJECTED: "crimson",
  REVIEWED: "neutral",
} as const;

function statusTone(status: string): "teal" | "amber" | "neutral" {
  if (status === "ACTIVE") return "teal";
  if (status === "PENDING_APPROVAL") return "amber";
  return "neutral";
}

/** PLATFORM_ADMIN only (requireRole redirects everyone else to /forbidden). */
export default async function PlatformAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; prStatus?: string }>;
}) {
  const user = await requireRole("PLATFORM_ADMIN");
  const d = getDictionary();
  const params = await searchParams;

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      kind: true,
      status: true,
      _count: { select: { members: true } },
    },
  });

  const partnerStatusFilter = ["PENDING", "APPROVED", "REJECTED", "REVIEWED"].includes(
    params.prStatus ?? ""
  )
    ? params.prStatus!
    : "PENDING";
  const partnerRequests = await prisma.partnerRequest.findMany({
    where: { status: partnerStatusFilter },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  const openPartnerCount = await prisma.partnerRequest.count({ where: { status: "PENDING" } });

  // ---- Emergency network oversight: camps awaiting verification + flagged requests ----
  const pendingCamps = await listCampsForModeration();
  const flaggedRequests = await listFlaggedEmergencyRequests();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
  const [requests24h, fulfilled24h, donorsNotified, donorsAccepted] = await Promise.all([
    prisma.emergencyRequest.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.emergencyRequest.count({ where: { fulfilledAt: { gte: dayAgo } } }),
    prisma.emergencyMatch.count({ where: { kind: "DONOR", notifiedAt: { gte: dayAgo } } }),
    prisma.emergencyMatch.count({ where: { kind: "DONOR", acceptedAt: { gte: dayAgo } } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{d.admin.platformTitle}</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-soft">{d.admin.platformSubtitle}</p>
        <p className="mt-1 text-sm text-ink-faint">{user.email}</p>
      </div>

      <Table caption={d.admin.platformTitle}>
        <THead>
          <TR>
            <TH>{d.admin.colOrgName}</TH>
            <TH>{d.admin.colKind}</TH>
            <TH>{d.common.status}</TH>
            <TH>{d.admin.colMembers}</TH>
            <TH>
              <span className="sr-only">{d.common.submit}</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {orgs.map((org) => (
            <TR key={org.id}>
              <TD className="font-medium text-ink">{org.name}</TD>
              <TD>{org.kind}</TD>
              <TD>
                <Badge tone={statusTone(org.status)}>{d.admin[STATUS_LABEL[org.status as keyof typeof STATUS_LABEL] ?? "statusACTIVE"] ?? org.status}</Badge>
              </TD>
              <TD>{org._count.members}</TD>
              <TD>
                <form action={setOrgStatusAction} className="flex items-center gap-2">
                  <CsrfInput />
                  <input type="hidden" name="orgId" value={org.id} />
                  {org.status === "ACTIVE" ? (
                    <>
                      <input type="hidden" name="target" value="SUSPENDED" />
                      <input
                        type="text"
                        name="reason"
                        required
                        minLength={4}
                        maxLength={200}
                        placeholder={d.admin.revokeReasonPlaceholder}
                        aria-label={d.admin.orgReasonLabel}
                        className="rs-input w-44 text-xs"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-crimson-600/30 bg-white px-3 py-1.5 text-sm font-medium text-crimson-700 transition-colors hover:border-crimson-600/60 hover:bg-crimson-50"
                      >
                        {d.admin.orgDeactivate}
                      </button>
                    </>
                  ) : (
                    <>
                      <input type="hidden" name="target" value="ACTIVE" />
                      <input
                        type="text"
                        name="reason"
                        required
                        minLength={4}
                        maxLength={200}
                        placeholder={d.admin.revokeReasonPlaceholder}
                        aria-label={d.admin.orgReasonLabel}
                        className="rs-input w-44 text-xs"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50"
                      >
                        {d.admin.orgActivate}
                      </button>
                    </>
                  )}
                </form>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <section aria-labelledby="partner-requests-heading" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="partner-requests-heading" className="text-xl font-bold tracking-tight text-ink">
            {d.admin.partnerRequestsTitle}
            {openPartnerCount > 0 ? (
              <Badge tone="amber" className="ml-2">
                {d.admin.partnerOpenCount.replace("{count}", String(openPartnerCount))}
              </Badge>
            ) : null}
          </h2>
          <nav aria-label={d.admin.partnerFilterAria} className="flex gap-1">
            {(["PENDING", "APPROVED", "REJECTED", "REVIEWED"] as const).map((status) => (
              <Link
                key={status}
                href={`/admin/platform?prStatus=${status}`}
                aria-current={partnerStatusFilter === status ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  partnerStatusFilter === status
                    ? "bg-teal-50 text-teal-700"
                    : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                {d.admin[`partnerStatus${status}` as `partnerStatus${typeof status}`]}
              </Link>
            ))}
          </nav>
        </div>

        {params.error === "reason_required" ? (
          <Alert type="error">{d.admin.partnerErrorReason}</Alert>
        ) : null}
        {params.error === "partner_state" || params.error === "partner_invalid" ? (
          <Alert type="error">{d.admin.partnerErrorState}</Alert>
        ) : null}

        {partnerRequests.length === 0 ? (
          <p className="rounded-2xl border border-ink/10 bg-white px-4 py-6 text-center text-sm text-ink-soft">
            {d.admin.partnerEmpty}
          </p>
        ) : (
          <Table caption={d.admin.partnerRequestsTitle}>
            <THead>
              <TR>
                <TH>{d.admin.colOrgName}</TH>
                <TH>{d.admin.partnerColContact}</TH>
                <TH>{d.admin.partnerColKind}</TH>
                <TH>{d.admin.partnerColMessage}</TH>
                <TH>{d.admin.partnerColAction}</TH>
              </TR>
            </THead>
            <TBody>
              {partnerRequests.map((request) => (
                <TR key={request.id}>
                  <TD className="font-medium text-ink">
                    {request.orgName}
                    <span className="block text-xs text-ink-faint">{[request.city, request.state].filter(Boolean).join(", ")}</span>
                  </TD>
                  <TD>
                    {request.contactName}
                    <span className="block text-xs text-ink-faint">{request.workEmail}</span>
                  </TD>
                  <TD>
                    <Badge tone="outline">{request.orgKind}</Badge>
                  </TD>
                  <TD className="max-w-56 text-xs text-ink-soft">{request.message ?? "—"}</TD>
                  <TD>
                    {request.status === "PENDING" || request.status === "REVIEWED" ? (
                      <div className="space-y-2">
                        <form action={approvePartnerRequestAction} className="flex items-center gap-2">
                          <CsrfInput />
                          <input type="hidden" name="requestId" value={request.id} />
                          <select
                            name="orgKind"
                            defaultValue={request.orgKind === "HOSPITAL" ? "HOSPITAL" : "BLOOD_BANK"}
                            aria-label={d.admin.partnerKindLabel}
                            className="rs-input w-40 text-xs"
                          >
                            <option value="BLOOD_BANK">{d.admin.partnerKindBB}</option>
                            <option value="HOSPITAL">{d.admin.partnerKindHosp}</option>
                            <option value="BLOOD_BANK_AND_HOSPITAL">{d.admin.partnerKindBoth}</option>
                          </select>
                          <button
                            type="submit"
                            className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50"
                          >
                            {d.admin.partnerApprove}
                          </button>
                        </form>
                        <form action={rejectPartnerRequestAction} className="flex items-center gap-2">
                          <CsrfInput />
                          <input type="hidden" name="requestId" value={request.id} />
                          <input
                            type="text"
                            name="reason"
                            required
                            minLength={4}
                            maxLength={200}
                            placeholder={d.admin.revokeReasonPlaceholder}
                            aria-label={d.admin.partnerRejectReasonLabel}
                            className="rs-input w-44 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-crimson-600/30 bg-white px-3 py-1.5 text-sm font-medium text-crimson-700 transition-colors hover:border-crimson-600/60 hover:bg-crimson-50"
                          >
                            {d.admin.partnerReject}
                          </button>
                        </form>
                      </div>
                    ) : (
                      <Badge tone={PARTNER_STATUS_TONE[request.status as keyof typeof PARTNER_STATUS_TONE] ?? "neutral"}>
                        {request.status}
                      </Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="emergency-stats-heading" className="space-y-4">
        <h2 id="emergency-stats-heading" className="text-xl font-bold tracking-tight text-ink">
          {d.admin.emergencyStatsTitle}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile value={requests24h} label={d.admin.emergencyStatsRequests} />
          <StatTile value={fulfilled24h} label={d.admin.emergencyStatsFulfilled} />
          <StatTile value={donorsNotified} label={d.admin.emergencyStatsDonorsNotified} />
          <StatTile value={donorsAccepted} label={d.admin.emergencyStatsDonorsAccepted} />
          <StatTile value={pendingCamps.length} label={d.admin.campsTitle} />
        </div>
      </section>

      <section aria-labelledby="camps-moderation-heading" className="space-y-4">
        <h2 id="camps-moderation-heading" className="text-xl font-bold tracking-tight text-ink">
          {d.admin.campsTitle}
        </h2>
        <p className="text-sm text-ink-soft">{d.admin.campsIntro}</p>

        {params.error === "camp_state" ? <Alert type="error">{d.admin.partnerErrorState}</Alert> : null}

        {pendingCamps.length === 0 ? (
          <p className="rounded-2xl border border-ink/10 bg-white px-4 py-6 text-center text-sm text-ink-soft">
            {d.admin.campsEmpty}
          </p>
        ) : (
          <Table caption={d.admin.campsTitle}>
            <THead>
              <TR>
                <TH>{d.admin.campColName}</TH>
                <TH>{d.admin.campColOrganizer}</TH>
                <TH>{d.admin.campColWhen}</TH>
                <TH>{d.admin.campColWhere}</TH>
                <TH>{d.admin.partnerColAction}</TH>
              </TR>
            </THead>
            <TBody>
              {pendingCamps.map((camp) => {
                const fmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
                return (
                  <TR key={camp.id}>
                    <TD className="font-medium text-ink">{camp.name}</TD>
                    <TD>{camp.org.name}</TD>
                    <TD className="text-xs">
                      {fmt.format(camp.startsAt)} → {fmt.format(camp.endsAt)}
                    </TD>
                    <TD className="text-xs">
                      {camp.venue}, {camp.city}
                      {camp.state ? `, ${camp.state}` : ""}
                    </TD>
                    <TD>
                      <div className="space-y-2">
                        <form action={approveCampAction} className="flex items-center gap-2">
                          <CsrfInput />
                          <input type="hidden" name="campId" value={camp.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50"
                          >
                            {d.admin.campApprove}
                          </button>
                        </form>
                        <form action={rejectCampAction} className="flex items-center gap-2">
                          <CsrfInput />
                          <input type="hidden" name="campId" value={camp.id} />
                          <input
                            type="text"
                            name="reason"
                            required
                            minLength={4}
                            maxLength={200}
                            placeholder={d.admin.revokeReasonPlaceholder}
                            aria-label={d.admin.campRejectReasonLabel}
                            className="rs-input w-44 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-crimson-600/30 bg-white px-3 py-1.5 text-sm font-medium text-crimson-700 transition-colors hover:border-crimson-600/60 hover:bg-crimson-50"
                          >
                            {d.admin.campReject}
                          </button>
                        </form>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="emergency-moderation-heading" className="space-y-4">
        <h2 id="emergency-moderation-heading" className="text-xl font-bold tracking-tight text-ink">
          {d.admin.emergencyModerationTitle}
        </h2>
        <p className="text-sm text-ink-soft">{d.admin.emergencyModerationIntro}</p>

        {flaggedRequests.length === 0 ? (
          <p className="rounded-2xl border border-ink/10 bg-white px-4 py-6 text-center text-sm text-ink-soft">
            {d.admin.emergencyModerationEmpty}
          </p>
        ) : (
          <Table caption={d.admin.emergencyModerationTitle}>
            <THead>
              <TR>
                <TH>{d.admin.emergencyColRequest}</TH>
                <TH>{d.admin.emergencyColHospital}</TH>
                <TH>{d.admin.emergencyColNeeded}</TH>
                <TH>{d.admin.emergencyColReason}</TH>
                <TH>{d.admin.emergencyColStatus}</TH>
                <TH>{d.admin.partnerColAction}</TH>
              </TR>
            </THead>
            <TBody>
              {flaggedRequests.map((request) => (
                <TR key={request.id}>
                  <TD className="font-mono text-xs">{request.requestNumber}</TD>
                  <TD>
                    {request.hospitalName}
                    <span className="block text-xs text-ink-faint">{request.city}</span>
                  </TD>
                  <TD className="text-xs">
                    <Badge tone="outline">{request.bloodGroup}</Badge> {request.unitsRequested}u ·{" "}
                    {request.urgency}
                  </TD>
                  <TD className="text-xs">
                    <Badge tone={request.moderationStatus === "BLOCKED" ? "crimson" : "amber"}>
                      {request.flagReason ?? request.moderationStatus}
                    </Badge>
                  </TD>
                  <TD className="text-xs">
                    {translate(DEFAULT_LOCALE, `emergency.status${request.status}`)}
                  </TD>
                  <TD>
                    <form action={setEmergencyModerationAction} className="flex items-center gap-2">
                      <CsrfInput />
                      <input type="hidden" name="requestId" value={request.id} />
                      {request.moderationStatus === "BLOCKED" ? (
                        <>
                          <input type="hidden" name="block" value="false" />
                          <button
                            type="submit"
                            className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50"
                          >
                            {d.admin.emergencyUnblock}
                          </button>
                        </>
                      ) : (
                        <>
                          <input type="hidden" name="block" value="true" />
                          <input
                            type="text"
                            name="reason"
                            required
                            minLength={4}
                            maxLength={200}
                            placeholder={d.admin.revokeReasonPlaceholder}
                            aria-label={d.admin.orgReasonLabel}
                            className="rs-input w-44 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-crimson-600/30 bg-white px-3 py-1.5 text-sm font-medium text-crimson-700 transition-colors hover:bg-crimson-50"
                          >
                            {d.admin.emergencyBlock}
                          </button>
                        </>
                      )}
                    </form>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
