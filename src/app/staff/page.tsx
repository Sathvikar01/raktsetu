import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState } from "@/packages/ui";
import { can, requireRole } from "@/lib/rbac";
import { getDictionary } from "@/i18n";
import { prisma } from "@/packages/database/client";
import type { SessionUser } from "@/lib/auth/session";
import { BloodBankSection } from "./sections/BloodBankSection";
import { HospitalSection } from "./sections/HospitalSection";
import { InventorySection } from "./sections/InventorySection";
import { IncomingRequestsPanel, HospitalRequestsPanel } from "./sections/BloodRequestsSection";
import { EmergencyRequestsSection } from "./sections/EmergencyRequestsSection";
import { RecentActivity } from "./sections/RecentActivity";
import type { ExpiryWindow } from "@/lib/services/inventory";

export const metadata: Metadata = { title: "Staff portal" };

interface VisibleOrg {
  id: string;
  name: string;
  kind: string;
  status: string;
  membershipRole: string | null;
}

async function visibleOrganizations(user: SessionUser): Promise<VisibleOrg[]> {
  if (user.role === "PLATFORM_ADMIN") {
    const orgs = await prisma.organization.findMany({ orderBy: { name: "asc" } });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      kind: o.kind,
      status: o.status,
      membershipRole: user.role,
    }));
  }
  const memberships = await prisma.organizationUser.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { role: true, org: { select: { id: true, name: true, kind: true, status: true } } },
  });
  return memberships.map((m) => ({
    id: m.org.id,
    name: m.org.name,
    kind: m.org.kind,
    status: m.org.status,
    membershipRole: m.role,
  }));
}

function kindLabel(kind: string): string {
  const d = getDictionary();
  if (kind === "BLOOD_BANK") return d.staff.kindBLOOD_BANK;
  if (kind === "HOSPITAL") return d.staff.kindHOSPITAL;
  return d.staff.kindBLOOD_BANK_AND_HOSPITAL;
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{
    org?: string;
    invType?: string;
    invGroup?: string;
    invState?: string;
    invWindow?: string;
    invQ?: string;
    invPage?: string;
  }>;
}) {
  const user = await requireRole("ORG_STAFF", "ORG_ADMIN", "PLATFORM_ADMIN");
  const d = getDictionary();
  const params = await searchParams;
  const { org: orgParam } = params;

  const orgs = await visibleOrganizations(user);

  if (orgs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{d.staff.portalTitle}</h1>
        <EmptyState title={d.staff.noOrgs} />
      </div>
    );
  }

  const selected = orgs.find((o) => o.id === orgParam) ?? orgs[0]!;
  const showBloodBank = selected.kind === "BLOOD_BANK" || selected.kind === "BLOOD_BANK_AND_HOSPITAL";
  const showHospital = selected.kind === "HOSPITAL" || selected.kind === "BLOOD_BANK_AND_HOSPITAL";
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{d.staff.portalTitle}</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-soft">{d.staff.portalSubtitle}</p>
      </div>

      <nav aria-label={d.staff.chooseOrg}>
        <ul className="flex flex-wrap gap-2">
          {orgs.map((org) => {
            const active = org.id === selected.id;
            return (
              <li key={org.id}>
                <Link
                  href={`/staff?org=${org.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 text-sm transition-colors ${
                    active
                      ? "border-teal-600/50 bg-teal-50 text-teal-800"
                      : "border-ink/10 bg-white text-ink-soft hover:border-teal-600/30 hover:text-ink"
                  }`}
                >
                  <span className="font-semibold">{org.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="outline">{kindLabel(org.kind)}</Badge>
                    {org.membershipRole ? (
                      <Badge tone={active ? "teal" : "neutral"}>
                        {org.membershipRole === "ORG_ADMIN"
                          ? d.staff.roleAdmin
                          : org.membershipRole === "PLATFORM_ADMIN"
                            ? org.membershipRole
                            : d.staff.roleStaff}
                      </Badge>
                    ) : null}
                    {org.status !== "ACTIVE" ? <Badge tone="amber">{org.status}</Badge> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-10">
        {showBloodBank ? <BloodBankSection organizationId={selected.id} /> : null}
        {showBloodBank ? (
          <InventorySection
            organizationId={selected.id}
            filters={{
              componentType: params.invType || undefined,
              bloodGroup: params.invGroup || undefined,
              state: params.invState || undefined,
              expiryWindow: (["expired", "week", "month", "later"] as const).includes(
                params.invWindow as ExpiryWindow
              )
                ? (params.invWindow as ExpiryWindow)
                : undefined,
              query: params.invQ || undefined,
              page: Number(params.invPage) || 1,
            }}
          />
        ) : null}
        {showBloodBank ? <IncomingRequestsPanel organizationId={selected.id} /> : null}
        {showBloodBank ? <EmergencyRequestsSection organizationId={selected.id} /> : null}
        {showHospital ? <HospitalSection organizationId={selected.id} /> : null}
        {showHospital ? <HospitalRequestsPanel organizationId={selected.id} /> : null}
        <RecentActivity organizationId={selected.id} />
      </div>
    </div>
  );
}
