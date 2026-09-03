import "server-only";
/**
 * One-click demo journey (DEMO_MODE only).
 * Drives the SAME production services the staff portal and signed API use —
 * no fake side-door — against the seeded demo organizations, then returns a
 * visitor-facing summary: event timeline + the donor link code.
 */
import { env } from "@/lib/env";
import { randomUUID } from "node:crypto";
import { prisma } from "@/packages/database/client";
import {
  recordDonation,
  completeProcessing,
  createComponents,
  transferComponent,
} from "@/lib/services/bloodbank-ops";
import { receiveComponent, transfuseComponent } from "@/lib/services/hospital-ops";

const BB_ORG_NAME = "Seva Blood Centre";
const HOSPITAL_ORG_NAME = "City General Hospital";
const BB_FACILITY_CODE = "SBC-LAB";
const HOSPITAL_FACILITY_CODE = "MAIN";

export interface DemoJourneyResult {
  ok: boolean;
  message?: string;
  linkCode?: string;
  din?: string;
  events?: Array<{ labelKey: string; at: Date }>;
}

export async function runDemoJourney(): Promise<DemoJourneyResult> {
  if (!env.DEMO_MODE) {
    return { ok: false, message: "Demo mode is disabled on this deployment." };
  }

  const [bb, hospital] = await Promise.all([
    prisma.organization.findFirst({ where: { name: BB_ORG_NAME }, select: { id: true } }),
    prisma.organization.findFirst({ where: { name: HOSPITAL_ORG_NAME }, select: { id: true } }),
  ]);
  if (!bb || !hospital) {
    return { ok: false, message: "Demo organizations are not seeded. Run `npm run seed` first." };
  }

  const suffix = Date.now().toString(36);
  const donatedAt = new Date();

  const donationResult = await recordDonation(
    {
      organizationId: bb.id,
      externalDonationId: `demo-${suffix}`,
      din: `DEMO-DIN-${suffix}`,
      bloodGroup: "O+",
      donatedAt,
      facilityCode: BB_FACILITY_CODE,
    },
    { ingestedByUserId: null }
  );
  const { donationId, linkCode } = donationResult;

  await completeProcessing({ organizationId: bb.id, donationId });

  const components = await createComponents({
    organizationId: bb.id,
    donationId,
    components: [{ componentType: "RBC", externalComponentId: `demo-rbc-${suffix}` }],
  });
  const componentId = components.componentIds[0];
  if (!componentId) {
    return { ok: false, message: "Could not prepare the demo component." };
  }

  await transferComponent({
    organizationId: bb.id,
    componentId,
    destinationFacilityExternalCode: "CGH-MAIN",
  });
  await receiveComponent({
    organizationId: hospital.id,
    componentId,
    facilityCode: HOSPITAL_FACILITY_CODE,
  });
  await transfuseComponent({
    organizationId: hospital.id,
    componentId,
    facilityCode: HOSPITAL_FACILITY_CODE,
    disclosure: {
      level: "BROAD_PURPOSE",
      category: "EMERGENCY_CARE",
      // Opaque hospital-side reference (PI-1) — required by the wire schema.
      recipient_ref: `demo-${randomUUID()}`,
      patient_consent_verified: true,
    },
  });

  const events = await prisma.lifecycleEvent.findMany({
    where: { donationId },
    orderBy: [{ occurredAt: "asc" }, { receivedAt: "asc" }],
    select: { eventType: true, occurredAt: true },
  });

  return {
    ok: true,
    linkCode,
    din: `DEMO-DIN-${suffix}`,
    events: events.map((e) => ({
      labelKey: `privacy.event.${e.eventType}`,
      at: e.occurredAt,
    })),
  };
}
