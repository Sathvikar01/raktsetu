import type { Metadata } from "next";
import { Badge, Table, TBody, TD, TH, THead, TR } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { prisma } from "@/packages/database/client";
import { requireRole } from "@/lib/rbac";
import { setOrgStatusAction } from "../actions";

export const metadata: Metadata = { title: "Platform organizations" };

const STATUS_LABEL = {
  ACTIVE: "statusACTIVE",
  SUSPENDED: "statusSUSPENDED",
  PENDING_APPROVAL: "statusPENDING_APPROVAL",
} as const;

function statusTone(status: string): "teal" | "amber" | "neutral" {
  if (status === "ACTIVE") return "teal";
  if (status === "PENDING_APPROVAL") return "amber";
  return "neutral";
}

/** PLATFORM_ADMIN only (requireRole redirects everyone else to /forbidden). */
export default async function PlatformAdminPage() {
  const user = await requireRole("PLATFORM_ADMIN");
  const d = getDictionary();

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
    </div>
  );
}
