import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/packages/database/client";
import { env } from "@/lib/env";
import { linkDonationToDonor } from "@/lib/services/account";
import {
  completeProcessing,
  createComponents,
  recordDonation,
  transferComponent,
} from "@/lib/services/bloodbank-ops";
import { receiveComponent, transfuseComponent } from "@/lib/services/hospital-ops";
import { generateIsbtDin } from "@/packages/integrations/mock-store";

/**
 * DEMO_MODE-gated simulator facade. Demo organizations are fixed for seed
 * parity ("Seva Blood Centre" / "City General Hospital"); they are looked up
 * lazily so the simulator fails loudly (never silently fakes data) when the
 * seed has not run. Every state change routes through bloodbank-ops /
 * hospital-ops → ingestEvent(), identical domain logic as production events.
 */

export const DEMO_BLOOD_BANK_NAME = "Seva Blood Centre";
export const DEMO_HOSPITAL_NAME = "City General Hospital";
/** Must match the hospital's Facility.externalCode created by the seed. */
export const DEMO_HOSPITAL_FACILITY_CODE = "CGH-MAIN";

const SYNTHETIC = "(synthetic demo)";

function requireDemoMode(): void {
  if (!env.DEMO_MODE) {
    throw new Error("Simulator unavailable: DEMO_MODE is disabled.");
  }
}

interface DemoOrg {
  id: string;
  name: string;
}

async function requireDemoOrg(name: string, kind: string): Promise<DemoOrg> {
  const org = await prisma.organization.findFirst({
    where: { name, kind },
    select: { id: true, name: true },
  });
  if (!org) {
    throw new Error(
      `Demo organization "${name}" (${kind}) not found. Run the seed script first (npm run seed).`
    );
  }
  return org;
}

// ---------------------------------------------------------------------------
// Individual step functions (staff UI consumes these in wave 2)
// ---------------------------------------------------------------------------

export interface SimulateRecordDonationOptions {
  donorEmail?: string | null;
  externalDonationId?: string;
}

export async function simulateRecordDonation(options: SimulateRecordDonationOptions = {}): Promise<{
  donationId: string;
  linkCode: string;
  din: string;
  externalDonationId: string;
  linkedDonor: boolean;
  label: string;
}> {
  requireDemoMode();
  const bb = await requireDemoOrg(DEMO_BLOOD_BANK_NAME, "BLOOD_BANK");

  // Plausible ISBT-style DIN via the mock blood-bank system's generator.
  const existing = await prisma.donation.count({ where: { organizationId: bb.id } });
  const din = generateIsbtDin(new Date(), existing + 1);
  const externalDonationId =
    options.externalDonationId ?? `DEMO-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

  const recorded = await recordDonation({
    organizationId: bb.id,
    externalDonationId,
    din,
    donatedAt: new Date(),
  });

  let linkedDonor = false;
  if (options.donorEmail) {
    const user = await prisma.user.findUnique({
      where: { email: options.donorEmail.trim().toLowerCase() },
      include: { donorProfile: true },
    });
    if (user) {
      const linked = await linkDonationToDonor(user.id, user.donorProfile?.id ?? null, recorded.linkCode);
      linkedDonor = Boolean(linked.ok);
    }
  }

  return {
    ...recorded,
    din,
    externalDonationId,
    linkedDonor,
    label: `Donation ${din} collected at ${DEMO_BLOOD_BANK_NAME} ${SYNTHETIC}`,
  };
}

export async function simulateProcessing(donationId: string): Promise<{
  processingEventId: string;
  screeningEventId: string;
  label: string;
}> {
  requireDemoMode();
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { organizationId: true },
  });
  if (!donation) throw new Error("Donation not found");
  const result = await completeProcessing({ organizationId: donation.organizationId, donationId });
  return { ...result, label: `Processing + screening completed ${SYNTHETIC}` };
}

export interface SimulatedComponents {
  componentIds: Record<"RBC" | "PLASMA" | "PLATELET", string>;
  label: string;
}

export async function simulateComponents(donationId: string): Promise<SimulatedComponents> {
  requireDemoMode();
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { organizationId: true, externalDonationId: true },
  });
  if (!donation) throw new Error("Donation not found");
  const base = donation.externalDonationId;
  const { componentIds } = await createComponents({
    organizationId: donation.organizationId,
    donationId,
    components: [
      { componentType: "RBC", externalComponentId: `${base}-RBC` },
      { componentType: "PLASMA", externalComponentId: `${base}-PLASMA` },
      { componentType: "PLATELET", externalComponentId: `${base}-PLATELET` },
    ],
  });
  return {
    componentIds: { RBC: componentIds[0]!, PLASMA: componentIds[1]!, PLATELET: componentIds[2]! },
    label: `RBC + plasma + platelet prepared ${SYNTHETIC}`,
  };
}

export async function simulateTransferToHospital(componentId: string): Promise<{ label: string }> {
  requireDemoMode();
  const component = await prisma.bloodComponent.findUnique({
    where: { id: componentId },
    select: { donation: { select: { organizationId: true } } },
  });
  if (!component) throw new Error("Component not found");
  await transferComponent({
    organizationId: component.donation.organizationId,
    componentId,
    destinationFacilityExternalCode: DEMO_HOSPITAL_FACILITY_CODE,
  });
  return { label: `RBC transferred to ${DEMO_HOSPITAL_NAME} ${SYNTHETIC}` };
}

export async function simulateReceiveAtHospital(componentId: string): Promise<{ label: string }> {
  requireDemoMode();
  const hospital = await requireDemoOrg(DEMO_HOSPITAL_NAME, "HOSPITAL");
  await receiveComponent({ organizationId: hospital.id, componentId });
  return { label: `Received at ${DEMO_HOSPITAL_NAME} ${SYNTHETIC}` };
}

export async function simulateTransfusion(componentId: string): Promise<{
  grantedLevel: string | null;
  label: string;
}> {
  requireDemoMode();
  const hospital = await requireDemoOrg(DEMO_HOSPITAL_NAME, "HOSPITAL");
  const result = await transfuseComponent({
    organizationId: hospital.id,
    componentId,
    disclosure: {
      level: "BROAD_PURPOSE",
      category: "EMERGENCY_CARE",
      recipient_ref: `anon-ref-${randomUUID().replace(/-/g, "").slice(0, 10)}`,
      patient_consent_verified: true,
    },
  });
  return {
    grantedLevel: result.disclosureGrantedLevel ?? null,
    label: `Transfused in emergency care ${SYNTHETIC}`,
  };
}

// ---------------------------------------------------------------------------
// Full journey
// ---------------------------------------------------------------------------

export interface FullJourneyResult {
  banner: string;
  donation: { id: string; linkCode: string; din: string; linkedDonor: boolean };
  components: SimulatedComponents["componentIds"];
  transfusionGrantedLevel: string | null;
  steps: Array<{ key: string; label: string }>;
}

/**
 * Donation → processing/screening → three components → transfer to the demo
 * hospital → receipt → transfusion (BROAD_PURPOSE, EMERGENCY_CARE). The RBC
 * transfer targets Facility.externalCode "CGH-MAIN" so the hospital's later
 * receive/transfuse are authorized through the normal ingest path.
 */
export async function simulateFullJourney(options: SimulateRecordDonationOptions = {}): Promise<FullJourneyResult> {
  requireDemoMode();

  const donationStep = await simulateRecordDonation(options);
  const processingStep = await simulateProcessing(donationStep.donationId);
  const componentsStep = await simulateComponents(donationStep.donationId);
  const transferStep = await simulateTransferToHospital(componentsStep.componentIds.RBC);
  const receiveStep = await simulateReceiveAtHospital(componentsStep.componentIds.RBC);
  const transfusionStep = await simulateTransfusion(componentsStep.componentIds.RBC);

  return {
    banner: SYNTHETIC,
    donation: {
      id: donationStep.donationId,
      linkCode: donationStep.linkCode,
      din: donationStep.din,
      linkedDonor: donationStep.linkedDonor,
    },
    components: componentsStep.componentIds,
    transfusionGrantedLevel: transfusionStep.grantedLevel,
    steps: [
      { key: "DONATION_COLLECTED", label: donationStep.label },
      { key: "PROCESSING_COMPLETED", label: processingStep.label },
      { key: "COMPONENTS_CREATED", label: componentsStep.label },
      { key: "COMPONENT_TRANSFERRED", label: transferStep.label },
      { key: "COMPONENT_RECEIVED", label: receiveStep.label },
      { key: "COMPONENT_TRANSFUSED", label: transfusionStep.label },
    ],
  };
}
