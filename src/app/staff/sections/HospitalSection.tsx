import { AGE_BANDS, DISCLOSURE_LEVELS, TREATMENT_CATEGORIES, type AgeBand, type DisclosureLevel, type TreatmentCategory } from "@/packages/schemas/events";
import { getDictionary } from "@/i18n";
import { prisma } from "@/packages/database/client";
import {
  DiscardUnitForm,
  IssueForm,
  ReceiveForm,
  ReturnForm,
  TransfuseForm,
} from "../components/HospitalForms";

interface ComponentRow {
  id: string;
  externalComponentId: string | null;
  componentType: string;
  currentDerivedState: string;
  donation: { externalDonationId: string };
}

const SELECT_BASE = {
  id: true,
  externalComponentId: true,
  componentType: true,
  currentDerivedState: true,
  donation: { select: { externalDonationId: true } },
} as const;

/**
 * Components this hospital is allowed to act on:
 *  - units with a VERIFIED transfer naming one of our facility codes as
 *    destination (the same predicate ingestEvent() enforces), plus
 *  - the org's own components (relevant for BLOOD_BANK_AND_HOSPITAL kind).
 */
async function authorizedComponentIds(organizationId: string): Promise<string[]> {
  const facilities = await prisma.facility.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const facilityIds = new Set(facilities.map((f) => f.id));
  const ids = new Set<string>();
  if (facilityIds.size > 0) {
    const transfers = await prisma.lifecycleEvent.findMany({
      where: { eventType: "COMPONENT_TRANSFERRED", verificationStatus: "VERIFIED", componentId: { not: null } },
      orderBy: { receivedAt: "desc" },
      take: 1000, // demo-scale scan; predicate mirrors hospitalAuthorizedForComponent()
      select: { componentId: true, payloadJson: true },
    });
    for (const t of transfers) {
      if (!t.componentId) continue;
      try {
        const payload = t.payloadJson ? (JSON.parse(t.payloadJson) as Record<string, unknown>) : {};
        const dest = typeof payload["destination_facility_id"] === "string" ? payload["destination_facility_id"] : null;
        if (dest && facilityIds.has(dest)) ids.add(t.componentId);
      } catch {
        // malformed payload — ignore (fail closed)
      }
    }
  }
  return [...ids];
}

/** Hospital operations panel — org kind HOSPITAL or BLOOD_BANK_AND_HOSPITAL. */
export async function HospitalSection({ organizationId }: { organizationId: string }) {
  const d = getDictionary();

  const [authorizedIds, ownUnits] = await Promise.all([
    authorizedComponentIds(organizationId),
    prisma.bloodComponent.findMany({
      where: {
        donation: { organizationId },
        currentDerivedState: { in: ["AVAILABLE", "RESERVED", "RECEIVED", "ISSUED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: SELECT_BASE,
    }),
  ]);

  const incoming =
    authorizedIds.length > 0
      ? await prisma.bloodComponent.findMany({
          where: { id: { in: authorizedIds }, currentDerivedState: "TRANSFERRED" },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: SELECT_BASE,
        })
      : [];

  const actingUnits =
    authorizedIds.length > 0
      ? await prisma.bloodComponent.findMany({
          where: {
            OR: [
              { id: { in: authorizedIds } },
              { donation: { organizationId } },
            ],
            currentDerivedState: { in: ["AVAILABLE", "RESERVED", "RECEIVED", "ISSUED"] },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: SELECT_BASE,
        })
      : ownUnits;

  function toOption(c: ComponentRow): { value: string; label: string } {
    return {
      value: c.id,
      label:
        (c.externalComponentId ?? "?") +
        ` · ${d.components[c.componentType as keyof typeof d.components] ?? c.componentType}` +
        ` · ${c.currentDerivedState}`,
    };
  }

  const incomingOptions = incoming.map(toOption);
  const unitOptions = actingUnits.map(toOption);

  const levels = DISCLOSURE_LEVELS.map((l) => ({
    value: l,
    label: d.staff[`level${l}` as `level${DisclosureLevel}`],
  }));
  const categories = TREATMENT_CATEGORIES.map((c) => ({
    value: c,
    label: d.categories[c as TreatmentCategory] ?? c,
  }));
  const ageBands = AGE_BANDS.map((a) => ({ value: a, label: a }));

  return (
    <section aria-labelledby="hosp-panel-heading" className="space-y-4">
      <h2 id="hosp-panel-heading" className="text-xl font-bold tracking-tight text-ink">
        {d.staff.panelHospital}
      </h2>
      <div className="grid gap-4 xl:grid-cols-2">
        <ReceiveForm organizationId={organizationId} incoming={incomingOptions} />
        <IssueForm organizationId={organizationId} units={unitOptions} />
        <ReturnForm organizationId={organizationId} units={unitOptions} />
        <DiscardUnitForm organizationId={organizationId} units={unitOptions} />
        <TransfuseForm
          organizationId={organizationId}
          units={unitOptions}
          levels={levels}
          categories={categories}
          ageBands={ageBands}
        />
      </div>
    </section>
  );
}
