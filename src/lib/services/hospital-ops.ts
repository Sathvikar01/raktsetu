import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/packages/database/client";
import { ingestEvent, type IngestContext, type IngestResult } from "@/lib/services/ingest";
import type { InboundEvent, InboundEventSchema } from "@/packages/schemas/ingestion";
import type { z } from "zod";

/**
 * Hospital staff/demo operations. Authorization is enforced inside
 * ingestEvent(): a hospital may act on a component only when a VERIFIED
 * transfer named one of its facility codes as destination — these helpers add
 * no authorization of their own (fail closed by construction).
 * Attribution: sourceSystem `hospital-<orgId slice 0..8>`, org kind from DB.
 */

export class HospitalOpsNotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "HospitalOpsNotFoundError";
  }
}

export interface OpsActor {
  ingestedByUserId?: string | null;
}

type DisclosureInput = NonNullable<z.infer<typeof InboundEventSchema>["disclosure"]>;

function iso(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d.toISOString();
}

async function hospitalContext(organizationId: string, actor?: OpsActor): Promise<IngestContext> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { kind: true },
  });
  if (!org) throw new HospitalOpsNotFoundError("Organization not found");
  return {
    organizationId,
    sourceSystem: `hospital-${organizationId.slice(0, 8)}`,
    orgKind: org.kind,
    ingestedByUserId: actor?.ingestedByUserId ?? null,
  };
}

async function loadComponent(componentId: string) {
  const component = await prisma.bloodComponent.findUnique({
    where: { id: componentId },
    select: { id: true, externalComponentId: true },
  });
  if (!component) throw new HospitalOpsNotFoundError("Component not found");
  return component;
}

interface HospitalComponentInput {
  organizationId: string;
  componentId: string;
  occurredAt?: Date | string;
  facilityCode?: string | null;
}

/**
 * Components are addressed by internal UUID (opaque; never exposed in URLs or
 * logs of recipient data). ingestEvent() performs the tenant authz check.
 */
async function ingestComponentEvent(
  eventType: InboundEvent["event_type"],
  input: HospitalComponentInput,
  actor?: OpsActor | undefined,
  extra?: Partial<Pick<InboundEvent, "metadata" | "disclosure">>
): Promise<IngestResult> {
  const ctx = await hospitalContext(input.organizationId, actor);
  const component = await loadComponent(input.componentId);
  return ingestEvent(
    {
      external_event_id: `${eventType.toLowerCase()}:${component.id}:${randomUUID()}`,
      component_identifier: component.id,
      identifier_scheme: "INTERNAL_UUID",
      event_type: eventType,
      occurred_at: iso(input.occurredAt ?? new Date()),
      verification_status: "VERIFIED",
      ...(input.facilityCode ? { facility_code: input.facilityCode } : {}),
      ...(extra?.metadata ? { metadata: extra.metadata } : {}),
      ...(extra?.disclosure ? { disclosure: extra.disclosure } : {}),
    },
    ctx
  );
}

export function receiveComponent(
  input: HospitalComponentInput,
  actor?: OpsActor
): Promise<IngestResult> {
  return ingestComponentEvent("COMPONENT_RECEIVED", input, actor);
}

export function issueComponent(
  input: HospitalComponentInput & { issuedToRef?: string | null },
  actor?: OpsActor
): Promise<IngestResult> {
  // issuedToRef is an opaque local reference only — never a patient identifier.
  return ingestComponentEvent(
    "COMPONENT_ISSUED",
    input,
    actor,
    input.issuedToRef ? { metadata: { issued_to_ref: input.issuedToRef } } : undefined
  );
}

export function returnComponent(
  input: HospitalComponentInput & { reason?: string | null },
  actor?: OpsActor
): Promise<IngestResult> {
  return ingestComponentEvent(
    "COMPONENT_RETURNED",
    input,
    actor,
    input.reason ? { metadata: { reason: input.reason } } : undefined
  );
}

export function discardComponent(
  input: HospitalComponentInput & { reason?: string | null },
  actor?: OpsActor
): Promise<IngestResult> {
  return ingestComponentEvent(
    "COMPONENT_DISCARDED",
    input,
    actor,
    input.reason ? { metadata: { reason: input.reason } } : undefined
  );
}

export interface TransfuseComponentInput extends HospitalComponentInput {
  disclosure: DisclosureInput;
}

export function transfuseComponent(
  input: TransfuseComponentInput,
  actor?: OpsActor
): Promise<IngestResult> {
  return ingestComponentEvent(
    "COMPONENT_TRANSFUSED",
    input,
    actor,
    { disclosure: input.disclosure }
  );
}
