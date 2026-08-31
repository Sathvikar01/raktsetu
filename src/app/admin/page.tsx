import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/packages/ui";
import { can } from "@/lib/rbac";
import { getDictionary } from "@/i18n";
import { prisma } from "@/packages/database/client";
import type { SessionUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/rbac";
import { CreateIntegrationForm } from "./components/CreateIntegrationForm";
import { IntegrationsPanel } from "./components/IntegrationsPanel";

export const metadata: Metadata = { title: "Admin console" };

interface VisibleOrg {
  id: string;
  name: string;
  kind: string;
  status: string;
}

async function visibleOrganizations(user: SessionUser): Promise<VisibleOrg[]> {
  if (user.role === "PLATFORM_ADMIN") {
    return prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true, status: true },
    });
  }
  const memberships = await prisma.organizationUser.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { org: { select: { id: true, name: true, kind: true, status: true } } },
  });
  return memberships.map((m) => m.org);
}

const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; q?: string; actor?: string; resource?: string }>;
}) {
  const user = await requireRole("ORG_ADMIN", "PLATFORM_ADMIN");
  const d = getDictionary();
  const params = await searchParams;

  const orgs = await visibleOrganizations(user);
  if (orgs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{d.admin.portalTitle}</h1>
        <EmptyState title={d.admin.noOrgs} />
      </div>
    );
  }

  const selected = orgs.find((o) => o.id === params.org) ?? orgs[0]!;

  const canWriteIntegrations =
    can(user.role, "integration:write:own-org") || can(user.role, "integration:manage:any");
  const canReadAuditAny = can(user.role, "audit:read:any");
  const canReadAuditOwn = can(user.role, "audit:read:own-org");

  // ---- Integrations (credentials carry no plaintext secrets) ----
  const integrationsRaw = await prisma.integration.findMany({
    where: { orgId: selected.id },
    orderBy: { createdAt: "desc" },
    include: {
      credentials: { orderBy: { createdAt: "desc" } },
    },
  });

  // ---- Audit viewer (permission-gated, org-scoped unless audit:read:any) ----
  const auditVisible = canReadAuditAny || canReadAuditOwn;
  const actionFilter = (params.q ?? "").trim().slice(0, 80);
  const actorFilter = ["USER", "INTEGRATION", "SYSTEM"].includes(params.actor ?? "")
    ? (params.actor as string)
    : null;
  const resourceFilter = (params.resource ?? "").trim().slice(0, 80);

  let auditRows: Array<{
    id: string;
    action: string;
    actorType: string;
    resourceType: string;
    resourceId: string | null;
    createdAt: Date;
  }> = [];
  if (auditVisible) {
    auditRows = await prisma.auditLog.findMany({
      where: {
        ...(canReadAuditAny ? {} : { orgId: selected.id }),
        ...(actionFilter ? { action: { contains: actionFilter } } : {}),
        ...(actorFilter ? { actorType: actorFilter } : {}),
        ...(resourceFilter ? { resourceType: { contains: resourceFilter } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        actorType: true,
        resourceType: true,
        resourceId: true,
        createdAt: true,
      },
    });
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{d.admin.portalTitle}</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-soft">{d.admin.portalSubtitle}</p>
      </div>

      <nav aria-label={d.admin.chooseOrg}>
        <ul className="flex flex-wrap gap-2">
          {orgs.map((org) => {
            const active = org.id === selected.id;
            return (
              <li key={org.id}>
                <Link
                  href={`/admin?org=${org.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 text-sm transition-colors ${
                    active
                      ? "border-teal-600/50 bg-teal-50 text-teal-800"
                      : "border-ink/10 bg-white text-ink-soft hover:border-teal-600/30 hover:text-ink"
                  }`}
                >
                  <span className="font-semibold">{org.name}</span>
                  <Badge tone={active ? "teal" : "outline"}>{org.kind}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="integrations-heading" className="space-y-4">
        <h2 id="integrations-heading" className="text-xl font-bold tracking-tight text-ink">
          {d.admin.integrations}
        </h2>
        <IntegrationsPanel
          organizationId={selected.id}
          canWrite={canWriteIntegrations}
          integrations={integrationsRaw.map((i) => ({
            id: i.id,
            name: i.name,
            adapterType: i.adapterType,
            status: i.status,
            description: i.description,
            credentials: i.credentials.map((c) => ({
              id: c.id,
              keyId: c.keyId,
              status: c.status,
              rotatedAtLabel: c.rotatedAt ? dateTimeFormat.format(c.rotatedAt) : null,
              lastUsedAtLabel: c.lastUsedAt ? dateTimeFormat.format(c.lastUsedAt) : null,
            })),
          }))}
        />
        {canWriteIntegrations ? <CreateIntegrationForm organizationId={selected.id} /> : null}
      </section>

      {auditVisible ? (
        <section aria-labelledby="audit-heading" className="space-y-4">
          <h2 id="audit-heading" className="text-xl font-bold tracking-tight text-ink">
            {d.admin.auditLog}
          </h2>
          <p className="text-sm text-ink-soft">{d.admin.auditNote}</p>

          {/* GET filter form — works without client JS */}
          <form method="get" action="/admin" className="grid gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-4 sm:grid-cols-[1fr_minmax(0,9rem)_1fr_auto] sm:items-end">
            <input type="hidden" name="org" value={selected.id} />
            <div>
              <label htmlFor="audit-q" className="mb-1 block text-sm font-medium text-ink">
                {d.admin.auditFilterAction}
              </label>
              <input
                id="audit-q"
                name="q"
                defaultValue={actionFilter}
                maxLength={80}
                className="rs-input"
              />
            </div>
            <div>
              <label htmlFor="audit-actor" className="mb-1 block text-sm font-medium text-ink">
                {d.admin.auditFilterActorType}
              </label>
              <select id="audit-actor" name="actor" defaultValue={actorFilter ?? ""} className="rs-input">
                <option value="">{d.admin.filterAll}</option>
                <option value="USER">USER</option>
                <option value="INTEGRATION">INTEGRATION</option>
                <option value="SYSTEM">SYSTEM</option>
              </select>
            </div>
            <div>
              <label htmlFor="audit-resource" className="mb-1 block text-sm font-medium text-ink">
                {d.admin.auditFilterResource}
              </label>
              <input
                id="audit-resource"
                name="resource"
                defaultValue={resourceFilter}
                maxLength={80}
                className="rs-input"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-teal-600/30 bg-white px-4 py-2 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50"
            >
              {d.admin.applyFilters}
            </button>
          </form>

          {auditRows.length === 0 ? (
            <p className="text-sm text-ink-soft">{d.admin.noAuditEntries}</p>
          ) : (
            <Table caption={d.admin.auditLog}>
              <THead>
                <TR>
                  <TH>{d.admin.colCreatedAt}</TH>
                  <TH>{d.admin.colAction}</TH>
                  <TH>{d.admin.colActorType}</TH>
                  <TH>{d.admin.colResourceType}</TH>
                  <TH>{d.admin.colResourceId}</TH>
                </TR>
              </THead>
              <TBody>
                {auditRows.map((row) => (
                  <TR key={row.id}>
                    <TD>{dateTimeFormat.format(row.createdAt)}</TD>
                    <TD>
                      <code className="font-mono text-xs">{row.action}</code>
                    </TD>
                    <TD>{row.actorType}</TD>
                    <TD>{row.resourceType}</TD>
                    <TD>
                      <code className="font-mono text-xs">{row.resourceId ?? "—"}</code>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </section>
      ) : null}
    </div>
  );
}
