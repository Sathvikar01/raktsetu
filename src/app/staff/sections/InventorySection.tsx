import Link from "next/link";
import { Badge, EmptyState, Input, Label, Select, Table, TBody, TD, TH, THead, TR } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { COMPONENT_TYPES, BLOOD_GROUPS, type ComponentType } from "@/packages/schemas/events";
import { getInventorySnapshot, type ExpiryWindow, type InventoryFilters } from "@/lib/services/inventory";
import { prisma } from "@/packages/database/client";

const EXPIRY_WINDOWS: ExpiryWindow[] = ["expired", "week", "month", "later"];
const LIVE_STATES = ["PREPARING", "AVAILABLE", "RESERVED", "TRANSFERRED", "RECEIVED", "ISSUED", "RETURNED"];

function expiryBadge(expiresAt: Date | null): { tone: "crimson" | "amber" | "teal" | "neutral"; label: string } {
  const d = getDictionary();
  const fmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
  if (!expiresAt) return { tone: "neutral", label: d.inventory.noExpiry };
  const days = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { tone: "crimson", label: `${d.inventory.expiredPrefix} ${fmt.format(expiresAt)}` };
  if (days <= 7) return { tone: "amber", label: `${fmt.format(expiresAt)} · ${d.inventory.daysLeft.replace("{days}", String(days))}` };
  return { tone: "teal", label: fmt.format(expiresAt) };
}

/** Blood-bank inventory: stock summary + filterable unit table (server-filtered via URL params). */
export async function InventorySection({
  organizationId,
  filters,
}: {
  organizationId: string;
  filters: InventoryFilters;
}) {
  const d = getDictionary();
  const [snapshot, facilities] = await Promise.all([
    getInventorySnapshot(organizationId, filters),
    prisma.facility.findMany({
      where: { organizationId },
      select: { id: true, name: true, code: true },
    }),
  ]);
  const facilityNames = new Map(facilities.map((f) => [f.id, `${f.name} (${f.code})`]));
  const pageParams = new URLSearchParams();
  if (filters.componentType) pageParams.set("invType", filters.componentType);
  if (filters.bloodGroup) pageParams.set("invGroup", filters.bloodGroup);
  if (filters.state) pageParams.set("invState", filters.state);
  if (filters.expiryWindow) pageParams.set("invWindow", filters.expiryWindow);
  if (filters.query) pageParams.set("invQ", filters.query);
  const pageHref = (page: number) => {
    const p = new URLSearchParams(pageParams);
    p.set("invPage", String(page));
    return `/staff?org=${organizationId}&${p.toString()}`;
  };

  const buckets = snapshot.expiryBuckets;

  return (
    <section aria-labelledby="inventory-heading" className="space-y-4">
      <h2 id="inventory-heading" className="text-xl font-bold tracking-tight text-ink">
        {d.inventory.title}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { key: "expired", tone: "crimson" as const, value: buckets.expired, label: d.inventory.bucketExpired },
            { key: "week", tone: "amber" as const, value: buckets.week, label: d.inventory.bucketWeek },
            { key: "month", tone: "orange" as const, value: buckets.month, label: d.inventory.bucketMonth },
            { key: "later", tone: "teal" as const, value: buckets.later, label: d.inventory.bucketLater },
          ] as const
        ).map((b) => (
          <Link
            key={b.key}
            href={`/staff?org=${organizationId}&invWindow=${b.key}`}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 transition-colors hover:border-teal-600/30"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-soft">{b.label}</span>
              <Badge tone={b.tone}>{b.value}</Badge>
            </div>
          </Link>
        ))}
      </div>

      {snapshot.availability.length > 0 ? (
        <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">{d.inventory.availabilityTitle}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {snapshot.availability
              .filter((a) => a.count > 0)
              .map((a) => (
                <li key={`${a.componentType}-${a.bloodGroup ?? "unknown"}`}>
                  <Link href={`/staff?org=${organizationId}&invType=${encodeURIComponent(a.componentType)}${a.bloodGroup ? `&invGroup=${encodeURIComponent(a.bloodGroup)}` : ""}`}>
                    <Badge tone="outline">
                      {d.components[a.componentType as ComponentType] ?? a.componentType}
                      {a.bloodGroup ? ` · ${a.bloodGroup}` : ""} × {a.count}
                    </Badge>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <form method="get" action="/staff" className="grid gap-3 rounded-2xl border border-ink/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <input type="hidden" name="org" value={organizationId} />
        <div>
          <Label htmlFor="inv-q">{d.inventory.filterQuery}</Label>
          <Input id="inv-q" name="invQ" defaultValue={filters.query ?? ""} placeholder={d.inventory.filterQueryPlaceholder} />
        </div>
        <div>
          <Label htmlFor="inv-type">{d.inventory.filterType}</Label>
          <Select id="inv-type" name="invType" defaultValue={filters.componentType ?? ""}>
            <option value="">{d.common.all}</option>
            {COMPONENT_TYPES.map((t) => (
              <option key={t} value={t}>{d.components[t] ?? t}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="inv-group">{d.inventory.filterGroup}</Label>
          <Select id="inv-group" name="invGroup" defaultValue={filters.bloodGroup ?? ""}>
            <option value="">{d.common.all}</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="inv-state">{d.inventory.filterState}</Label>
          <Select id="inv-state" name="invState" defaultValue={filters.state ?? ""}>
            <option value="">{d.common.all}</option>
            {LIVE_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="inv-window">{d.inventory.filterExpiry}</Label>
          <Select id="inv-window" name="invWindow" defaultValue={filters.expiryWindow ?? ""}>
            <option value="">{d.common.all}</option>
            {EXPIRY_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w === "expired" ? d.inventory.bucketExpired
                  : w === "week" ? d.inventory.bucketWeek
                  : w === "month" ? d.inventory.bucketMonth
                  : d.inventory.bucketLater}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 sm:col-span-2 lg:col-span-1">
          {d.inventory.applyFilters}
        </button>
      </form>

      {snapshot.rows.length === 0 ? (
        <EmptyState title={d.inventory.emptyTitle} body={d.inventory.emptyBody} />
      ) : (
        <Table caption={d.inventory.title}>
          <THead>
            <TR>
              <TH>{d.inventory.colUnit}</TH>
              <TH>{d.inventory.colType}</TH>
              <TH>{d.inventory.colGroup}</TH>
              <TH>{d.common.status}</TH>
              <TH>{d.inventory.colExpires}</TH>
              <TH>{d.inventory.colLocation}</TH>
            </TR>
          </THead>
          <TBody>
            {snapshot.rows.map((row) => {
              const exp = expiryBadge(row.expiresAt);
              return (
                <TR key={row.id}>
                  <TD className="font-mono text-xs text-ink">{row.externalComponentId ?? row.id.slice(0, 8)}</TD>
                  <TD>{d.components[row.componentType as ComponentType] ?? row.componentType}</TD>
                  <TD className="font-semibold">{row.bloodGroup ?? "—"}</TD>
                  <TD>
                    <Badge tone={row.state === "AVAILABLE" ? "green" : row.state === "RESERVED" ? "amber" : "neutral"}>
                      {row.state}
                    </Badge>
                  </TD>
                  <TD><Badge tone={exp.tone}>{exp.label}</Badge></TD>
                  <TD className="text-xs text-ink-soft">{row.locationFacilityId ? facilityNames.get(row.locationFacilityId) ?? "—" : "—"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      {snapshot.totalRows > snapshot.pageSize ? (
        <nav aria-label={d.inventory.paginationAria} className="flex items-center gap-3 text-sm">
          {snapshot.page > 1 ? (
            <Link href={pageHref(snapshot.page - 1)} className="text-teal-700 hover:underline">{d.inventory.prevPage}</Link>
          ) : null}
          <span className="text-ink-soft">
            {d.inventory.pageIndicator
              .replace("{page}", String(snapshot.page))
              .replace("{total}", String(Math.ceil(snapshot.totalRows / snapshot.pageSize)))}
          </span>
          {snapshot.page * snapshot.pageSize < snapshot.totalRows ? (
            <Link href={pageHref(snapshot.page + 1)} className="text-teal-700 hover:underline">{d.inventory.nextPage}</Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
