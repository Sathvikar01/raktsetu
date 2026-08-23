/**
 * View-layer privacy tests (PI-3/PI-4/PI-5/PI-6).
 * Rendering must resolve dictionary-reference params, gate every claim on
 * VERIFIED provenance, and degrade fail-closed — never invent or leak facts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/packages/database/client", () => ({
  prisma: {
    disclosureDecision: { findFirst: vi.fn() },
    bloodComponent: { findUnique: vi.fn() },
    lifecycleEvent: { findMany: vi.fn() },
    facility: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/packages/database/client";
import {
  renderDisclosureMessage,
  buildVerifiedDecisionView,
  assembleComponentDonorView,
  getVerifiedDecisionForEvent,
  getComponentDonorView,
  EVENT_LABEL_KEYS,
} from "@/lib/services/disclosure-view";

const decisionFindFirst = prisma.disclosureDecision.findFirst as unknown as Mock;
const componentFindUnique = prisma.bloodComponent.findUnique as unknown as Mock;
const eventFindMany = prisma.lifecycleEvent.findMany as unknown as Mock;
const facilityFindMany = prisma.facility.findMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  facilityFindMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Fixtures (in-memory fakes; no database involved)
// ---------------------------------------------------------------------------

function decisionRow(over: Record<string, unknown> = {}) {
  return {
    id: "dec_1",
    eventId: "evt_t1",
    requestedLevel: "LIMITED_ANON",
    grantedLevel: "BROAD_PURPOSE",
    messageKey: "privacy.transfusedBroadPrefix",
    paramsJson: JSON.stringify({
      component: "{components.PLASMA}",
      category: "{categories.CANCER_CARE}",
    }),
    degradedReason: null,
    cohortSize: 7,
    provenanceJson: JSON.stringify({
      chain: ["DisclosureDecision", "LifecycleEvent", "Organization"],
      eventId: "evt_t1",
      organizationId: "org_1",
      organizationName: "Stale Name",
      sourceSystem: "hmis-old",
      sourceEventId: "SE-OLD",
    }),
    createdAt: new Date("2026-08-01T00:00:00Z"),
    event: {
      verificationStatus: "VERIFIED",
      sourceSystem: "hmis-live",
      sourceEventId: "SE-LIVE",
      organization: { name: "City Hospital" },
    },
    ...over,
  };
}

type EventRow = Parameters<typeof assembleComponentDonorView>[1][number];

function ev(over: Partial<EventRow> & Pick<EventRow, "eventType">): EventRow {
  return {
    id: over.id ?? `evt_${over.eventType}`,
    occurredAt: over.occurredAt ?? new Date("2026-08-01T10:00:00Z"),
    receivedAt: over.receivedAt ?? new Date("2026-08-01T10:05:00Z"),
    verificationStatus: over.verificationStatus ?? "VERIFIED",
    supersededByCorrection: over.supersededByCorrection ?? false,
    facility: over.facility === undefined ? { city: "Pune" } : over.facility,
    eventType: over.eventType,
  };
}

const component = (state: string) => ({
  componentType: "RBC",
  currentDerivedState: state,
  preparedAt: new Date("2026-08-01T09:00:00Z"),
});

// ---------------------------------------------------------------------------
// renderDisclosureMessage
// ---------------------------------------------------------------------------

describe("renderDisclosureMessage", () => {
  it('resolves "{components.PLASMA}" to English copy', () => {
    const msg = renderDisclosureMessage({
      messageKey: "privacy.transfusedBroadPrefix",
      paramsJson: JSON.stringify({ component: "{components.PLASMA}", category: "{categories.SURGERY}" }),
    });
    expect(msg).toBe("Your Plasma donation supported surgery.");
  });

  it('resolves "{categories.CANCER_CARE}" to English copy', () => {
    const msg = renderDisclosureMessage({
      messageKey: "privacy.transfusedBroadPrefix",
      paramsJson: JSON.stringify({ component: "{components.RBC}", category: "{categories.CANCER_CARE}" }),
    });
    expect(msg).toBe("Your Red blood cells donation supported cancer care.");
  });

  it("passes plain-string params through verbatim (age bands are not dictionary refs)", () => {
    const msg = renderDisclosureMessage({
      messageKey: "privacy.transfusedLimited",
      paramsJson: JSON.stringify({ category: "{categories.SURGERY}", ageBand: "18-40" }),
    });
    expect(msg).toBe(
      "Your donation supported the treatment of a patient receiving surgery (18-40 age band)."
    );
  });

  it.each([null, ""])("messageKey=%p degrades to temporarily-unavailable copy", (key) => {
    expect(renderDisclosureMessage({ messageKey: key })).toBe(
      "Latest status temporarily unavailable."
    );
  });

  it("malformed paramsJson never throws and degrades to placeholder rendering", () => {
    const msg = renderDisclosureMessage({
      messageKey: "privacy.transfusedBroadPrefix",
      paramsJson: "{{{not json",
    });
    expect(msg).toBe("Your {component} donation supported {category}.");
  });

  it("drops non-string param values instead of interpolating them", () => {
    const msg = renderDisclosureMessage({
      messageKey: "privacy.transfusedBroadPrefix",
      paramsJson: JSON.stringify({ component: "{components.RBC}", category: 42, extra: { x: 1 } }),
    });
    expect(msg).toBe("Your Red blood cells donation supported {category}.");
  });

  it("JSON-array or scalar paramsJson is treated as empty params (fail closed)", () => {
    const msg = renderDisclosureMessage({
      messageKey: "privacy.transfusedGeneric",
      paramsJson: "[1,2,3]",
    });
    expect(msg).toBe("Your donation was successfully transfused.");
  });
});

// ---------------------------------------------------------------------------
// buildVerifiedDecisionView — provenance gate (PI-5/PI-6)
// ---------------------------------------------------------------------------

describe("buildVerifiedDecisionView", () => {
  it("builds a view for VERIFIED events with coarse provenance only", () => {
    const view = buildVerifiedDecisionView(decisionRow());
    expect(view).not.toBeNull();
    expect(view?.grantedLevel).toBe("BROAD_PURPOSE");
    expect(view?.renderedMessage).toContain("Plasma");
    expect(view?.provenance).toEqual({
      organizationName: "City Hospital",
      sourceSystem: "hmis-live",
      sourceEventId: "SE-LIVE",
    });
  });

  it("prefers live joined provenance over stale provenanceJson", () => {
    const view = buildVerifiedDecisionView(decisionRow());
    expect(view?.provenance.sourceSystem).toBe("hmis-live");
  });

  it("returns null for PENDING events", () => {
    expect(buildVerifiedDecisionView(decisionRow({ event: { verificationStatus: "PENDING", sourceSystem: "s", sourceEventId: "e", organization: null } }))).toBeNull();
  });

  it("returns null for REJECTED events", () => {
    expect(buildVerifiedDecisionView(decisionRow({ event: { verificationStatus: "REJECTED", sourceSystem: "s", sourceEventId: "e", organization: null } }))).toBeNull();
  });

  it("returns null when there is no decision row at all", () => {
    expect(buildVerifiedDecisionView(null)).toBeNull();
    expect(buildVerifiedDecisionView(undefined)).toBeNull();
  });

  it("survives corrupted provenanceJson without losing event-sourced provenance", () => {
    const view = buildVerifiedDecisionView(decisionRow({ provenanceJson: "{broken" }));
    expect(view).not.toBeNull();
    expect(view?.provenance.organizationName).toBe("City Hospital");
  });
});

// ---------------------------------------------------------------------------
// assembleComponentDonorView — verified-only timelines (PI-6)
// ---------------------------------------------------------------------------

describe("assembleComponentDonorView", () => {
  it("renders only VERIFIED events; PENDING sets awaitingVerification; REJECTED never appears", () => {
    const view = assembleComponentDonorView(component("AVAILABLE"), [
      ev({ eventType: "COMPONENT_CREATED" }),
      ev({ eventType: "COMPONENT_TRANSFERRED", verificationStatus: "PENDING" }),
      ev({ eventType: "COMPONENT_ISSUED", verificationStatus: "REJECTED" }),
    ], null);
    expect(view.events.map((e) => e.labelKey)).toEqual(["privacy.event.COMPONENT_CREATED"]);
    expect(view.awaitingVerification).toBe(true);
  });

  it("REJECTED-only activity does not claim anything is awaiting verification", () => {
    const view = assembleComponentDonorView(component("AVAILABLE"), [
      ev({ eventType: "COMPONENT_ISSUED", verificationStatus: "REJECTED" }),
    ], null);
    expect(view.awaitingVerification).toBe(false);
    expect(view.events).toEqual([]);
  });

  it("hides superseded originals corrected under PI-8", () => {
    const view = assembleComponentDonorView(component("AVAILABLE"), [
      ev({ eventType: "COMPONENT_CREATED", id: "evt_old", occurredAt: new Date("2026-08-01T08:00:00Z"), supersededByCorrection: true }),
      ev({ eventType: "EVENT_CORRECTION", id: "evt_fix", occurredAt: new Date("2026-08-02T08:00:00Z") }),
    ], null);
    expect(view.events.map((e) => e.labelKey)).toEqual(["privacy.event.EVENT_CORRECTION"]);
  });

  it("sorts the timeline chronologically regardless of input order", () => {
    const view = assembleComponentDonorView(component("AVAILABLE"), [
      ev({ eventType: "COMPONENT_AVAILABLE", occurredAt: new Date("2026-08-03T00:00:00Z") }),
      ev({ eventType: "DONATION_COLLECTED", occurredAt: new Date("2026-07-30T00:00:00Z") }),
      ev({ eventType: "COMPONENT_CREATED", occurredAt: new Date("2026-08-01T00:00:00Z") }),
    ], null);
    expect(view.events.map((e) => e.labelKey)).toEqual([
      "privacy.event.DONATION_COLLECTED",
      "privacy.event.COMPONENT_CREATED",
      "privacy.event.COMPONENT_AVAILABLE",
    ]);
  });

  it("exposes facility at city tier only, null when absent", () => {
    const view = assembleComponentDonorView(component("AVAILABLE"), [
      ev({ eventType: "COMPONENT_AVAILABLE", id: "evt_b", occurredAt: new Date("2026-08-02T00:00:00Z"), facility: null }),
      ev({ eventType: "COMPONENT_CREATED", id: "evt_a", occurredAt: new Date("2026-08-01T00:00:00Z"), facility: { city: "Pune" } }),
    ], null);
    expect(view.events.map((e) => e.facilityCityTier)).toEqual(["Pune", null]);
  });

  it("maps every cataloged event type to a label key", () => {
    const allTypes = Object.keys(EVENT_LABEL_KEYS);
    const rows = allTypes.map((t, i) =>
      ev({ eventType: t, id: `id_${i}`, occurredAt: new Date(Date.UTC(2026, 0, i + 1)) })
    );
    const view = assembleComponentDonorView(component("AVAILABLE"), rows, null);
    expect(view.events).toHaveLength(allTypes.length);
    for (const e of view.events) {
      expect(e.labelKey.startsWith("privacy.event.")).toBe(true);
    }
  });

  it("skips unknown event types instead of guessing a label (fail closed)", () => {
    const view = assembleComponentDonorView(component("AVAILABLE"), [
      ev({ eventType: "SOMETHING_MADE_UP" as EventRow["eventType"] }),
    ], null);
    expect(view.events).toEqual([]);
  });

  describe("impactMessage", () => {
    const transfusionDecision = {
      messageKey: "privacy.transfusedBroadPrefix",
      paramsJson: JSON.stringify({ component: "{components.RBC}", category: "{categories.SURGERY}" }),
    };

    it("renders the stored disclosure for TRANSFUSED components", () => {
      const view = assembleComponentDonorView(component("TRANSFUSED"), [
        ev({ eventType: "COMPONENT_TRANSFUSED" }),
      ], transfusionDecision);
      expect(view.impactMessage).toBe("Your Red blood cells donation supported surgery.");
    });

    it("renders nothing when TRANSFUSED has no bound decision (no provenance, no claim)", () => {
      const view = assembleComponentDonorView(component("TRANSFUSED"), [
        ev({ eventType: "COMPONENT_TRANSFUSED" }),
      ], null);
      expect(view.impactMessage).toBeNull();
    });

    it.each(["EXPIRED", "DISCARDED", "RECALLED"] as const)(
      "uses neutral lifecycle-complete copy for %s",
      (state) => {
        const view = assembleComponentDonorView(component(state), [], null);
        expect(view.impactMessage).toBe(
          "This component was not transfused and has completed its blood-bank lifecycle. Thank you for donating — blood banks must maintain appropriate inventory even when every unit is not used."
        );
      }
    );

    it("leaves impactMessage null mid-lifecycle", () => {
      const view = assembleComponentDonorView(component("ISSUED"), [], transfusionDecision);
      expect(view.impactMessage).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Thin prisma wrappers (mocked client)
// ---------------------------------------------------------------------------

describe("getVerifiedDecisionForEvent", () => {
  it("loads and gates the latest decision for the event", async () => {
    decisionFindFirst.mockResolvedValueOnce(decisionRow());
    const view = await getVerifiedDecisionForEvent("evt_t1");
    expect(decisionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "evt_t1" } })
    );
    expect(view?.decisionId).toBe("dec_1");
    expect(view?.renderedMessage).toContain("Plasma");
  });

  it("returns null when the backing event is PENDING", async () => {
    decisionFindFirst.mockResolvedValueOnce(
      decisionRow({ event: { verificationStatus: "PENDING", sourceSystem: "s", sourceEventId: "e", organization: null } })
    );
    expect(await getVerifiedDecisionForEvent("evt_p")).toBeNull();
  });

  it("returns null when the backing event is REJECTED", async () => {
    decisionFindFirst.mockResolvedValueOnce(
      decisionRow({ event: { verificationStatus: "REJECTED", sourceSystem: "s", sourceEventId: "e", organization: null } })
    );
    expect(await getVerifiedDecisionForEvent("evt_r")).toBeNull();
  });

  it("returns null when no decision exists", async () => {
    decisionFindFirst.mockResolvedValueOnce(null);
    expect(await getVerifiedDecisionForEvent("evt_none")).toBeNull();
  });
});

describe("getComponentDonorView", () => {
  it("assembles the donor view and binds the impact message to the latest verified transfusion", async () => {
    componentFindUnique.mockResolvedValueOnce(component("TRANSFUSED"));
    eventFindMany.mockResolvedValueOnce([
      ev({ id: "e1", eventType: "COMPONENT_CREATED" }),
      ev({ id: "e2", eventType: "COMPONENT_TRANSFUSED", verificationStatus: "PENDING" }),
      ev({ id: "e3", eventType: "COMPONENT_TRANSFUSED", occurredAt: new Date("2026-08-02T00:00:00Z") }),
    ]);
    decisionFindFirst.mockResolvedValueOnce(transfusionDecisionRow());

    const view = await getComponentDonorView("comp_1");

    expect(eventFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { componentId: "comp_1" } }));
    expect(decisionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "e3" } })
    );
    expect(view).toMatchObject({
      componentType: "RBC",
      derivedState: "TRANSFUSED",
      awaitingVerification: true,
      impactMessage: "Your Red blood cells donation supported surgery.",
    });
    expect(view?.events.map((e) => e.labelKey)).toEqual([
      "privacy.event.COMPONENT_CREATED",
      "privacy.event.COMPONENT_TRANSFUSED",
    ]);
  });

  function transfusionDecisionRow() {
    return {
      messageKey: "privacy.transfusedBroadPrefix",
      paramsJson: JSON.stringify({ component: "{components.RBC}", category: "{categories.SURGERY}" }),
    };
  }

  it("returns null for an unknown component without touching other tables", async () => {
    componentFindUnique.mockResolvedValueOnce(null);
    const view = await getComponentDonorView("missing");
    expect(view).toBeNull();
    expect(eventFindMany).not.toHaveBeenCalled();
    expect(decisionFindFirst).not.toHaveBeenCalled();
  });

  it("never queries a decision when no verified transfusion exists (fail closed)", async () => {
    componentFindUnique.mockResolvedValueOnce(component("TRANSFERRED"));
    eventFindMany.mockResolvedValueOnce([ev({ id: "e1", eventType: "COMPONENT_TRANSFERRED" })]);
    const view = await getComponentDonorView("comp_2");
    expect(decisionFindFirst).not.toHaveBeenCalled();
    expect(view?.impactMessage).toBeNull();
  });
});
