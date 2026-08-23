import "server-only";
import { fromJson } from "@/lib/json";
import type { ComponentState, DerivedEventView } from "@/packages/domain/derive";
import type { EventType, VerificationStatus } from "@/packages/schemas/events";
import type { Prisma } from "@prisma/client";

/**
 * Map stored LifecycleEvent rows onto the pure derivation input shape.
 * Selection is restricted to coarse fields; payloads are never rendered.
 */
type EventRow = Prisma.LifecycleEventGetPayload<{ select: typeof EVENT_SELECT }>;

export const EVENT_SELECT = {
  id: true,
  donationId: true,
  eventType: true,
  occurredAt: true,
  receivedAt: true,
  verificationStatus: true,
  organizationId: true,
  facilityId: true,
  sourceSystem: true,
  sourceEventId: true,
  correctionForEventId: true,
  payloadJson: true,
} satisfies Prisma.LifecycleEventSelect;

export function toDerivedEventView(row: EventRow): DerivedEventView {
  return {
    id: row.id,
    eventType: row.eventType as EventType,
    occurredAt: row.occurredAt,
    receivedAt: row.receivedAt,
    verificationStatus: row.verificationStatus as VerificationStatus,
    organizationId: row.organizationId,
    facilityId: row.facilityId,
    sourceSystem: row.sourceSystem,
    sourceEventId: row.sourceEventId,
    correctionForEventId: row.correctionForEventId,
    payload: fromJson<Record<string, unknown>>(row.payloadJson, {}),
  };
}

export function toComponentState(raw: string): ComponentState | null {
  return (raw as ComponentState) ?? null;
}

export type DerivedEventList = DerivedEventView[];
