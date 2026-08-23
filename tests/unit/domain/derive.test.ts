/**
 * Pure derivation tests for deriveComponentState() — no DB needed.
 * Clinical history must fail safely: PENDING never advances state, REJECTED
 * events vanish, corrections supersede their target, terminal states stick.
 */
import { describe, it, expect } from "vitest";
import { deriveComponentState, type DerivedEventView } from "@/packages/domain/derive";
import type { EventType } from "@/packages/schemas/events";

let seq = 0;
const t = (hour: number): Date => new Date(Date.UTC(2026, 0, 1, hour));

function ev(
  eventType: EventType,
  over: Partial<Omit<DerivedEventView, "eventType">> = {}
): DerivedEventView {
  seq += 1;
  const occurredAt = over.occurredAt ?? t(seq);
  return {
    id: over.id ?? `e${seq}`,
    eventType,
    occurredAt,
    receivedAt: over.receivedAt ?? occurredAt,
    verificationStatus: over.verificationStatus ?? "VERIFIED",
    organizationId: over.organizationId ?? "org-1",
    facilityId: over.facilityId ?? null,
    sourceSystem: over.sourceSystem ?? "test",
    sourceEventId: over.sourceEventId ?? `src-${seq}`,
    correctionForEventId: over.correctionForEventId ?? null,
    payload: over.payload ?? {},
  };
}

describe("deriveComponentState", () => {
  it("walks the happy chain CREATED-AVAILABLE-TRANSFERRED-RECEIVED-ISSUED-TRANSFUSED", () => {
    const result = deriveComponentState([
      ev("COMPONENT_CREATED", { occurredAt: t(1) }),
      ev("COMPONENT_AVAILABLE", { occurredAt: t(2) }),
      ev("COMPONENT_TRANSFERRED", { occurredAt: t(3) }),
      ev("COMPONENT_RECEIVED", { occurredAt: t(4) }),
      ev("COMPONENT_ISSUED", { occurredAt: t(5) }),
      ev("COMPONENT_TRANSFUSED", { occurredAt: t(6) }),
    ]);
    expect(result.state).toBe("TRANSFUSED");
    expect(result.awaitingVerification).toBe(false);
    expect(result.flags).toEqual([]);
    expect(result.lastVerifiedEvent?.eventType).toBe("COMPONENT_TRANSFUSED");
  });

  it("derives the same state regardless of array order (sorted by occurredAt)", () => {
    const shuffled = [
      ev("COMPONENT_TRANSFUSED", { occurredAt: t(6), id: "f6" }),
      ev("COMPONENT_CREATED", { occurredAt: t(1), id: "f1" }),
      ev("COMPONENT_ISSUED", { occurredAt: t(5), id: "f5" }),
      ev("COMPONENT_AVAILABLE", { occurredAt: t(2), id: "f2" }),
      ev("COMPONENT_RECEIVED", { occurredAt: t(4), id: "f4" }),
      ev("COMPONENT_TRANSFERRED", { occurredAt: t(3), id: "f3" }),
    ];
    const result = deriveComponentState(shuffled);
    expect(result.state).toBe("TRANSFUSED");
    expect(result.flags).toEqual([]);
  });

  it("PENDING events never advance state and set awaitingVerification", () => {
    const result = deriveComponentState([
      ev("COMPONENT_CREATED", { occurredAt: t(1) }),
      ev("COMPONENT_TRANSFUSED", { occurredAt: t(2), verificationStatus: "PENDING" }),
      ev("COMPONENT_ISSUED", { occurredAt: t(3), verificationStatus: "PENDING" }),
    ]);
    expect(result.state).toBe("PREPARING");
    expect(result.awaitingVerification).toBe(true);
    expect(result.flags).toEqual([]);
  });

  it("REJECTED events are ignored entirely", () => {
    const result = deriveComponentState([
      ev("COMPONENT_CREATED", { verificationStatus: "REJECTED", occurredAt: t(1) }),
      ev("COMPONENT_TRANSFERRED", { verificationStatus: "REJECTED", occurredAt: t(2) }),
      ev("COMPONENT_RECEIVED", { occurredAt: t(3) }),
    ]);
    expect(result.state).toBeNull();
    expect(result.awaitingVerification).toBe(false);
    expect(result.lastVerifiedEvent).toBeNull();
  });

  it("a correction supersedes its target event", () => {
    const correction = ev("EVENT_CORRECTION", {
      occurredAt: t(3),
      id: "corr-1",
      correctionForEventId: "evt-available",
    });
    const result = deriveComponentState([
      ev("COMPONENT_CREATED", { occurredAt: t(1), id: "evt-created" }),
      ev("COMPONENT_AVAILABLE", { occurredAt: t(2), id: "evt-available" }),
      correction,
    ]);
    // The corrected AVAILABLE vanishes; only CREATED remains effective.
    expect(result.state).toBe("PREPARING");
    expect(result.flags).toContain("CORRECTED_EVENT_PRESENT");
    expect(result.lastVerifiedEvent?.id).toBe("evt-created");
  });

  it("events after a terminal state flag and do not advance", () => {
    const transfusion = ev("COMPONENT_TRANSFUSED", { occurredAt: t(3) });
    const result = deriveComponentState([
      ev("COMPONENT_CREATED", { occurredAt: t(1) }),
      ev("COMPONENT_AVAILABLE", { occurredAt: t(2) }),
      transfusion,
      ev("COMPONENT_EXPIRED", { occurredAt: t(4) }),
    ]);
    expect(result.state).toBe("TRANSFUSED");
    expect(result.flags).toContain("EVENT_AFTER_TERMINAL");
    expect(result.lastVerifiedEvent?.eventType).toBe("COMPONENT_TRANSFUSED");
  });

  it("backward transitions raise the out-of-order flag (ISSUED then RETURNED)", () => {
    const result = deriveComponentState([
      ev("COMPONENT_CREATED", { occurredAt: t(1) }),
      ev("COMPONENT_AVAILABLE", { occurredAt: t(2) }),
      ev("COMPONENT_TRANSFERRED", { occurredAt: t(3) }),
      ev("COMPONENT_RECEIVED", { occurredAt: t(4) }),
      ev("COMPONENT_ISSUED", { occurredAt: t(5) }),
      ev("COMPONENT_RETURNED", { occurredAt: t(6) }),
    ]);
    expect(result.state).toBe("RECEIVED");
    expect(result.flags).toContain("OUT_OF_ORDER_EVENTS");
  });

  it("transfusion directly after RESERVED is allowed", () => {
    const result = deriveComponentState([
      ev("COMPONENT_CREATED", { occurredAt: t(1) }),
      ev("COMPONENT_AVAILABLE", { occurredAt: t(2) }),
      ev("COMPONENT_RESERVED", { occurredAt: t(3) }),
      ev("COMPONENT_TRANSFUSED", { occurredAt: t(4) }),
    ]);
    expect(result.state).toBe("TRANSFUSED");
    expect(result.flags).toEqual([]);
  });

  it("RETURNED maps the component back to RECEIVED without flags", () => {
    const result = deriveComponentState([
      ev("COMPONENT_CREATED", { occurredAt: t(1) }),
      ev("COMPONENT_AVAILABLE", { occurredAt: t(2) }),
      ev("COMPONENT_TRANSFERRED", { occurredAt: t(3) }),
      ev("COMPONENT_RECEIVED", { occurredAt: t(4) }),
      ev("COMPONENT_RETURNED", { occurredAt: t(5) }),
    ]);
    expect(result.state).toBe("RECEIVED");
    expect(result.flags).toEqual([]);
  });

  it("an uncorrected event stream with no events yields null state", () => {
    expect(deriveComponentState([]).state).toBeNull();
  });
});
