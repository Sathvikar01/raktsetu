import { describe, expect, it } from "vitest";
import { computeExpiry, SHELF_LIFE_DAYS } from "@/packages/domain/shelf-life";
import { COMPONENT_TYPES } from "@/packages/schemas/events";

describe("computeExpiry", () => {
  it("covers every catalogued component type", () => {
    for (const type of COMPONENT_TYPES) {
      expect(SHELF_LIFE_DAYS[type]).toBeGreaterThan(0);
    }
  });

  it("stamps platelets with the binding 5-day window", () => {
    const prepared = new Date("2026-09-01T10:00:00.000Z");
    expect(computeExpiry("PLATELET", prepared)).toEqual(new Date("2026-09-06T10:00:00.000Z"));
  });

  it("stamps RBC with 42 days", () => {
    const prepared = new Date("2026-09-01T00:00:00.000Z");
    expect(computeExpiry("RBC", prepared)!.getTime() - prepared.getTime()).toBe(42 * 86_400_000);
  });

  it("stamps frozen plasma with 365 days", () => {
    const prepared = new Date("2026-09-01T00:00:00.000Z");
    expect(computeExpiry("PLASMA", prepared)!.getTime() - prepared.getTime()).toBe(365 * 86_400_000);
  });

  it("returns null for unknown component types rather than guessing", () => {
    expect(computeExpiry("MYSTERY", new Date())).toBeNull();
  });
});
