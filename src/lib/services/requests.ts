import "server-only";
import { prisma } from "@/packages/database/client";
import { ingestEvent } from "@/lib/services/ingest";
import { dispatchDonorNotification } from "@/packages/notifications/service";
import { recordAudit } from "@/lib/audit";
import { OpsNotFoundError, OpsValidationError } from "@/lib/services/bloodbank-ops";
import { BLOOD_GROUPS, COMPONENT_TYPES, type BloodGroup, type ComponentType } from "@/packages/schemas/events";

/**
 * Hospital -> blood-bank unit requests. Creating/declining/canceling are plain
 * service calls; FULFILLMENT goes through ingestEvent() with a deterministic
 * `reserved:{componentId}:{requestId}` id so COMPONENT_RESERVED events are
 * idempotent and every state change stays in the event-sourced pipeline.
 */

export const REQUEST_URGENCIES = ["ROUTINE", "URGENT", "EMERGENCY"] as const;
export type RequestUrgency = (typeof REQUEST_URGENCIES)[number];

const TARGET_KINDS = new Set(["BLOOD_BANK", "BLOOD_BANK_AND_HOSPITAL"]);

export interface CreateRequestInput {
  requestingOrgId: string;
  targetOrgId: string;
  componentType: string;
  bloodGroup: string;
  unitsRequested: number;
  urgency?: string;
  note?: string | null;
  requestedById?: string | null;
}

export async function createBloodRequest(input: CreateRequestInput): Promise<{ requestId: string; requestNumber: string }> {
  if (!BLOOD_GROUPS.includes(input.bloodGroup as BloodGroup)) {
    throw new OpsValidationError("unknown bloodGroup");
  }
  if (!COMPONENT_TYPES.includes(input.componentType as ComponentType)) {
    throw new OpsValidationError("unknown componentType");
  }
  if (!Number.isInteger(input.unitsRequested) || input.unitsRequested < 1 || input.unitsRequested > 20) {
    throw new OpsValidationError("unitsRequested must be between 1 and 20");
  }
  const urgency = input.urgency ?? "ROUTINE";
  if (!REQUEST_URGENCIES.includes(urgency as RequestUrgency)) {
    throw new OpsValidationError("unknown urgency");
  }
  if (input.requestingOrgId === input.targetOrgId) {
    throw new OpsValidationError("requesting and target organization must differ");
  }

  const [requester, target] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: input.requestingOrgId },
      select: { id: true, status: true },
    }),
    prisma.organization.findUnique({
      where: { id: input.targetOrgId },
      select: { id: true, status: true, kind: true },
    }),
  ]);
  if (!requester || requester.status !== "ACTIVE") throw new OpsNotFoundError("Requesting organization not found");
  if (!target || !TARGET_KINDS.has(target.kind) || target.status !== "ACTIVE") {
    throw new OpsNotFoundError("Target blood bank not found");
  }

  const request = await prisma.bloodRequest.create({
    data: {
      requestingOrgId: input.requestingOrgId,
      targetOrgId: input.targetOrgId,
      componentType: input.componentType,
      bloodGroup: input.bloodGroup,
      unitsRequested: input.unitsRequested,
      urgency,
      note: input.note ?? null,
      requestedById: input.requestedById ?? null,
    },
  });

  await recordAudit({
    actorType: "USER",
    actorId: input.requestedById ?? null,
    action: "blood_request.created",
    resourceType: "BloodRequest",
    resourceId: request.id,
    orgId: input.requestingOrgId,
    metadata: { targetOrgId: input.targetOrgId, componentType: input.componentType, bloodGroup: input.bloodGroup, units: input.unitsRequested, urgency },
  });

  await notifyOrgStaff(input.targetOrgId, "notify.blood.request");

  return { requestId: request.id, requestNumber: request.requestNumber };
}

export async function listIncomingRequests(targetOrgId: string, statuses = ["PENDING"]) {
  const rows = await prisma.bloodRequest.findMany({
    where: { targetOrgId, status: { in: statuses } },
    orderBy: { createdAt: "asc" },
    include: {
      requestingOrg: { select: { name: true } },
      fulfillments: { select: { componentId: true } },
    },
  });
  return rows.sort(
    (a, b) =>
      urgencyRank(a.urgency) - urgencyRank(b.urgency) ||
      a.createdAt.getTime() - b.createdAt.getTime()
  );
}

export async function listOutgoingRequests(requestingOrgId: string, statuses = ["PENDING", "FULFILLED", "DECLINED", "CANCELLED"]) {
  return prisma.bloodRequest.findMany({
    where: { requestingOrgId, status: { in: statuses } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      targetOrg: { select: { name: true } },
      fulfillments: { select: { componentId: true } },
    },
  });
}

function urgencyRank(urgency: string): number {
  return urgency === "EMERGENCY" ? 0 : urgency === "URGENT" ? 1 : 2;
}

export interface FulfillResult {
  requestId: string;
  status: string;
  fulfilledCount: number;
  reservedComponentIds: string[];
  skipped: Array<{ componentId: string; reason: string }>;
}

/**
 * Reserve the given components against a PENDING request. Every component is
 * re-validated here (ownership, state, type/group match, unexpired) and then
 * pushed through ingestEvent() — the derive machine flips it to RESERVED.
 */
export async function fulfillBloodRequest(
  targetOrgId: string,
  requestId: string,
  componentIds: string[]
): Promise<FulfillResult> {
  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    include: {
      targetOrg: { select: { id: true, name: true, kind: true } },
      fulfillments: { select: { componentId: true } },
    },
  });
  if (!request || request.targetOrgId !== targetOrgId) throw new OpsNotFoundError("Request not found");
  if (request.status !== "PENDING") throw new OpsValidationError("request is not open");
  if (componentIds.length === 0) throw new OpsValidationError("no components selected");

  const alreadyFulfilled = request.fulfillments.length;
  const remaining = request.unitsRequested - alreadyFulfilled;
  if (remaining <= 0) throw new OpsValidationError("request is already fulfilled");

  const reserved: string[] = [];
  const skipped: Array<{ componentId: string; reason: string }> = [];

  for (const componentId of componentIds) {
    if (reserved.length >= remaining) break; // request already filled by this batch
    if (request.fulfillments.some((f) => f.componentId === componentId)) {
      skipped.push({ componentId, reason: "ALREADY_RESERVED" });
      continue;
    }
    const component = await prisma.bloodComponent.findUnique({
      where: { id: componentId },
      include: { donation: { select: { organizationId: true } } },
    });
    if (!component || component.donation.organizationId !== targetOrgId) {
      skipped.push({ componentId, reason: "NOT_OWNED" });
      continue;
    }
    if (component.componentType !== request.componentType || component.bloodGroup !== request.bloodGroup) {
      skipped.push({ componentId, reason: "TYPE_GROUP_MISMATCH" });
      continue;
    }
    if (component.currentDerivedState !== "AVAILABLE") {
      skipped.push({ componentId, reason: "NOT_AVAILABLE" });
      continue;
    }
    if (component.expiresAt && component.expiresAt.getTime() <= Date.now()) {
      skipped.push({ componentId, reason: "EXPIRED" });
      continue;
    }
    if (!component.externalComponentId) {
      skipped.push({ componentId, reason: "NO_EXTERNAL_ID" });
      continue;
    }

    const result = await ingestEvent(
      {
        external_event_id: `reserved:${component.id}:${request.id}`, // deterministic → replay-safe
        component_identifier: component.externalComponentId,
        identifier_scheme: "FACILITY_BARCODE",
        event_type: "COMPONENT_RESERVED",
        occurred_at: new Date().toISOString(),
        verification_status: "VERIFIED",
        metadata: { request_id: request.id },
      },
      {
        organizationId: targetOrgId,
        sourceSystem: `${slug(request.targetOrg.name)}-ops`,
        orgKind: request.targetOrg.kind,
      }
    );
    if (result.status === "ACCEPTED" || result.status === "DUPLICATE") {
      await prisma.requestFulfillment.create({
        data: {
          requestId: request.id,
          componentId: component.id,
          createdByOrgId: targetOrgId,
        },
      });
      reserved.push(component.id);
    } else {
      skipped.push({ componentId, reason: "INGEST_REJECTED" });
    }
  }

  const fulfilledCount = alreadyFulfilled + reserved.length;
  const status = fulfilledCount >= request.unitsRequested ? "FULFILLED" : "PENDING";
  if (reserved.length > 0) {
    await prisma.bloodRequest.update({
      where: { id: request.id },
      data: { status },
    });
  }

  await recordAudit({
    actorType: "SYSTEM",
    action: "blood_request.fulfilled_units",
    resourceType: "BloodRequest",
    resourceId: request.id,
    orgId: targetOrgId,
    metadata: { reservedCount: reserved.length, skippedCount: skipped.length, status },
  });

  if (status === "FULFILLED") {
    await notifyOrgStaff(request.requestingOrgId, "notify.blood.fulfilled");
  }

  return { requestId: request.id, status, fulfilledCount, reservedComponentIds: reserved, skipped };
}

export async function declineBloodRequest(
  targetOrgId: string,
  requestId: string,
  reason: string
): Promise<void> {
  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    select: { id: true, targetOrgId: true, status: true, requestingOrgId: true },
  });
  if (!request || request.targetOrgId !== targetOrgId) throw new OpsNotFoundError("Request not found");
  if (request.status !== "PENDING") throw new OpsValidationError("request is not open");
  if (!reason || reason.trim().length < 4) throw new OpsValidationError("decline reason required");
  await prisma.bloodRequest.update({
    where: { id: requestId },
    data: { status: "DECLINED", declineReason: reason.trim().slice(0, 200) },
  });
  await recordAudit({
    actorType: "SYSTEM",
    action: "blood_request.declined",
    resourceType: "BloodRequest",
    resourceId: requestId,
    orgId: targetOrgId,
    metadata: {},
  });
  await notifyOrgStaff(request.requestingOrgId, "notify.blood.declined");
}

export async function cancelBloodRequest(
  requestingOrgId: string,
  requestId: string
): Promise<void> {
  const request = await prisma.bloodRequest.findUnique({ where: { id: requestId }, select: { id: true, requestingOrgId: true, status: true } });
  if (!request || request.requestingOrgId !== requestingOrgId) throw new OpsNotFoundError("Request not found");
  if (request.status !== "PENDING") throw new OpsValidationError("request is not open");
  await prisma.bloodRequest.update({
    where: { id: requestId },
    data: { status: "CANCELLED" },
  });
  await recordAudit({
    actorType: "SYSTEM",
    action: "blood_request.cancelled",
    resourceType: "BloodRequest",
    resourceId: requestId,
    orgId: requestingOrgId,
    metadata: {},
  });
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
}

/** In-app notification to every ACTIVE member of the org (generic, privacy-safe copy). */
async function notifyOrgStaff(orgId: string, typeKey: string): Promise<void> {
  const members = await prisma.organizationUser.findMany({
    where: { orgId, status: "ACTIVE" },
    select: { userId: true },
  });
  for (const { userId } of members) {
    await dispatchDonorNotification({
      userId,
      typeKey,
      genericTitle: true,
      titleKey: "notify.genericUpdateTitle",
      bodyKey: "notify.genericUpdateBody",
    });
  }
}
