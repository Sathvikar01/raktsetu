import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/packages/database/client";
import { ingestEvent, type IngestContext, type IngestResult } from "@/lib/services/ingest";
import type { InboundEvent } from "@/packages/schemas/ingestion";

/**
 * Blood-bank staff/demo operations. Every state change builds an InboundEvent
 * and goes through ingestEvent() — no side doors (CONTRACTS hard rule).
 * Attribution: sourceSystem `<orgslug>-ops`, ingestedByUserId when a staff
 * user triggered the action.
 */

export class OpsNotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "OpsNotFoundError";
  }
}

export class OpsValidationError extends Error {
  constructor(message = "Invalid operation") {
    super(message);
    this.name = "OpsValidationError";
  }
}

export interface OpsActor {
  ingestedByUserId?: string | null;
}

function orgSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
}

function iso(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) throw new OpsValidationError("Invalid date");
  return d.toISOString();
}

async function bloodBankContext(organizationId: string, actor?: OpsActor): Promise<IngestContext> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  if (!org) throw new OpsNotFoundError("Organization not found");
  return {
    organizationId,
    sourceSystem: `${orgSlug(org.name)}-ops`,
    orgKind: "BLOOD_BANK",
    ingestedByUserId: actor?.ingestedByUserId ?? null,
  };
}

async function loadOwnedDonation(donationId: string, organizationId: string) {
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { id: true, externalDonationId: true, organizationId: true },
  });
  if (!donation || donation.organizationId !== organizationId) {
    // Deliberately generic — do not reveal other tenants' donations.
    throw new OpsNotFoundError("Donation not found");
  }
  return donation;
}

async function loadOwnedComponent(componentId: string, organizationId: string) {
  const component = await prisma.bloodComponent.findUnique({
    where: { id: componentId },
    include: { donation: { select: { organizationId: true } } },
  });
  if (!component || component.donation.organizationId !== organizationId) {
    throw new OpsNotFoundError("Component not found");
  }
  return component;
}

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

export interface RecordDonationInput {
  organizationId: string;
  externalDonationId: string;
  din?: string | null;
  donatedAt: Date | string;
  facilityCode?: string | null;
}

export async function recordDonation(
  input: RecordDonationInput,
  actor?: OpsActor
): Promise<{ donationId: string; linkCode: string }> {
  const ctx = await bloodBankContext(input.organizationId, actor);
  const externalDonationId = input.externalDonationId.trim();
  if (!externalDonationId) throw new OpsValidationError("externalDonationId is required");

  const clash = await prisma.donation.findUnique({
    where: {
      organizationId_externalDonationId: {
        organizationId: input.organizationId,
        externalDonationId,
      },
    },
    select: { id: true },
  });
  if (clash) throw new OpsValidationError("externalDonationId already recorded for this organization");

  let facilityId: string | undefined;
  if (input.facilityCode) {
    const facility = await prisma.facility.findFirst({
      where: { organizationId: input.organizationId, code: input.facilityCode },
      select: { id: true },
    });
    facilityId = facility?.id;
  }

  const donatedAtIso = iso(input.donatedAt);
  const donation = await prisma.donation.create({
    data: {
      organizationId: input.organizationId,
      externalDonationId,
      din: input.din ?? null,
      donatedAt: new Date(donatedAtIso),
      linkStatus: "UNLINKED", // linkCode uses the schema cuid default — issued to the donor as-is
      recordedVia: "MANUAL",
      ...(facilityId ? { facilityId } : {}),
    },
  });

  // Register the FACILITY_BARCODE identifier BEFORE ingestion so the event resolves.
  await prisma.externalIdentifier.create({
    data: {
      entityType: "DONATION",
      entityId: donation.id,
      scheme: "FACILITY_BARCODE",
      value: externalDonationId,
      organizationId: input.organizationId,
    },
  });

  const result = await ingestEvent(
    {
      external_event_id: `collected:${donation.id}`,
      donation_identifier: externalDonationId,
      identifier_scheme: "FACILITY_BARCODE",
      event_type: "DONATION_COLLECTED",
      occurred_at: donatedAtIso,
      verification_status: "VERIFIED",
      ...(input.facilityCode ? { facility_code: input.facilityCode } : {}),
    },
    ctx
  );

  return { donationId: donation.id, linkCode: donation.linkCode, ...result };
}

export interface CompleteProcessingInput {
  organizationId: string;
  donationId: string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  facilityCode?: string | null;
}

/** Emits DONATION_PROCESSING_STARTED + SCREENING_COMPLETED (idempotent per donation). */
export async function completeProcessing(
  input: CompleteProcessingInput,
  actor?: OpsActor
): Promise<{ processingEventId: string; screeningEventId: string }> {
  const ctx = await bloodBankContext(input.organizationId, actor);
  const donation = await loadOwnedDonation(input.donationId, input.organizationId);

  const startedAt = iso(input.startedAt ?? new Date());
  const completedAt = iso(input.completedAt ?? input.startedAt ?? new Date());

  const processing = await ingestEvent(
    {
      external_event_id: `processing-started:${donation.id}`,
      donation_identifier: donation.externalDonationId,
      identifier_scheme: "FACILITY_BARCODE",
      event_type: "DONATION_PROCESSING_STARTED",
      occurred_at: startedAt,
      verification_status: "VERIFIED",
      ...(input.facilityCode ? { facility_code: input.facilityCode } : {}),
    },
    ctx
  );

  const screening = await ingestEvent(
    {
      external_event_id: `screening-completed:${donation.id}`,
      donation_identifier: donation.externalDonationId,
      identifier_scheme: "FACILITY_BARCODE",
      event_type: "SCREENING_COMPLETED",
      occurred_at: completedAt,
      verification_status: "VERIFIED",
      ...(input.facilityCode ? { facility_code: input.facilityCode } : {}),
    },
    ctx
  );

  return { processingEventId: processing.lifecycleEventId, screeningEventId: screening.lifecycleEventId };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface CreateComponentsInput {
  organizationId: string;
  donationId: string;
  components: Array<{ componentType: string; externalComponentId: string }>;
}

/**
 * Creates BloodComponent rows + their FACILITY_BARCODE identifiers FIRST so
 * ingestion can resolve them, then emits one COMPONENT_CREATED per component.
 */
export async function createComponents(
  input: CreateComponentsInput,
  actor?: OpsActor
): Promise<{ componentIds: string[] }> {
  const ctx = await bloodBankContext(input.organizationId, actor);
  const donation = await loadOwnedDonation(input.donationId, input.organizationId);
  if (!Array.isArray(input.components) || input.components.length === 0) {
    throw new OpsValidationError("components must be a non-empty array");
  }

  const seenTypes = new Set<string>();
  for (const spec of input.components) {
    if (seenTypes.has(spec.componentType)) {
      throw new OpsValidationError(`Duplicate componentType ${spec.componentType} for one donation`);
    }
    seenTypes.add(spec.componentType);
  }

  // Pass 1: rows + identifiers so every COMPONENT_CREATED below resolves.
  const created: Array<{ id: string; externalComponentId: string }> = [];
  for (const spec of input.components) {
    const externalComponentId = spec.externalComponentId.trim();
    if (!externalComponentId) throw new OpsValidationError("externalComponentId is required");
    const clash = await prisma.bloodComponent.findFirst({
      where: { externalComponentId, donation: { organizationId: input.organizationId } },
      select: { id: true },
    });
    if (clash) throw new OpsValidationError(`externalComponentId ${externalComponentId} already exists`);

    const component = await prisma.bloodComponent.create({
      data: {
        donationId: donation.id,
        componentType: spec.componentType,
        externalComponentId,
        preparedAt: new Date(),
      },
    });
    await prisma.externalIdentifier.create({
      data: {
        entityType: "COMPONENT",
        entityId: component.id,
        scheme: "FACILITY_BARCODE",
        value: externalComponentId,
        organizationId: input.organizationId,
      },
    });
    created.push({ id: component.id, externalComponentId });
  }

  // Pass 2: append-only lifecycle events. Components leave quarantine
  // immediately: createComponents is only reachable after SCREENING_COMPLETED,
  // so CREATED is followed by AVAILABLE (release to inventory).
  for (const c of created) {
    await ingestEvent(
      {
        external_event_id: `created:${c.externalComponentId}`,
        component_identifier: c.externalComponentId,
        identifier_scheme: "FACILITY_BARCODE",
        event_type: "COMPONENT_CREATED",
        occurred_at: new Date().toISOString(),
        verification_status: "VERIFIED",
      },
      ctx
    );
    await ingestEvent(
      {
        external_event_id: `available:${c.externalComponentId}`,
        component_identifier: c.externalComponentId,
        identifier_scheme: "FACILITY_BARCODE",
        event_type: "COMPONENT_AVAILABLE",
        occurred_at: new Date().toISOString(),
        verification_status: "VERIFIED",
      },
      ctx
    );
  }

  return { componentIds: created.map((c) => c.id) };
}

export interface TransferComponentInput {
  organizationId: string;
  componentId: string;
  destinationFacilityExternalCode: string;
  occurredAt?: Date | string;
}

export async function transferComponent(
  input: TransferComponentInput,
  actor?: OpsActor
): Promise<IngestResult> {
  const ctx = await bloodBankContext(input.organizationId, actor);
  const component = await loadOwnedComponent(input.componentId, input.organizationId);
  if (!component.externalComponentId) throw new OpsValidationError("Component has no external id");

  return ingestEvent(
    {
      external_event_id: `transferred:${component.id}:${randomUUID()}`,
      component_identifier: component.externalComponentId,
      identifier_scheme: "FACILITY_BARCODE",
      event_type: "COMPONENT_TRANSFERRED",
      occurred_at: iso(input.occurredAt ?? new Date()),
      verification_status: "VERIFIED",
      metadata: { destination_facility_code: input.destinationFacilityExternalCode },
    },
    ctx
  );
}

async function terminalComponentEvent(
  eventType: "COMPONENT_EXPIRED" | "COMPONENT_DISCARDED",
  input: { organizationId: string; componentId: string; reason?: string | null; occurredAt?: Date | string },
  actor?: OpsActor
): Promise<IngestResult> {
  const ctx = await bloodBankContext(input.organizationId, actor);
  const component = await loadOwnedComponent(input.componentId, input.organizationId);
  if (!component.externalComponentId) throw new OpsValidationError("Component has no external id");
  const prefix = eventType === "COMPONENT_EXPIRED" ? "expired" : "discarded";

  return ingestEvent(
    {
      external_event_id: `${prefix}:${component.id}`, // deterministic → repeat calls are DUPLICATEs
      component_identifier: component.externalComponentId,
      identifier_scheme: "FACILITY_BARCODE",
      event_type: eventType,
      occurred_at: iso(input.occurredAt ?? new Date()),
      verification_status: "VERIFIED",
      ...(input.reason ? { metadata: { reason: input.reason } } : {}),
    },
    ctx
  );
}

export function markComponentExpired(
  input: { organizationId: string; componentId: string; reason?: string | null; occurredAt?: Date | string },
  actor?: OpsActor
): Promise<IngestResult> {
  return terminalComponentEvent("COMPONENT_EXPIRED", input, actor);
}

export function markComponentDiscarded(
  input: { organizationId: string; componentId: string; reason?: string | null; occurredAt?: Date | string },
  actor?: OpsActor
): Promise<IngestResult> {
  return terminalComponentEvent("COMPONENT_DISCARDED", input, actor);
}
