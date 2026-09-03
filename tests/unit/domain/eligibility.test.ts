import { describe, expect, it } from "vitest";
import {
  DONATION_INTERVAL_DAYS,
  DEFAULT_DONATION_KIND,
  eligibilityWindow,
  nextEligibleAt,
} from "@/packages/domain/eligibility";

const DAY_MS = 86_400_000;

describe("DONATION_INTERVAL_DAYS", () => {
  it("keeps the whole-blood window at the conservative 90-day guidance", () => {
    expect(DEFAULT_DONATION_KIND).toBe("WHOLE_BLOOD");
    expect(DONATION_INTERVAL_DAYS.WHOLE_BLOOD).toBe(90);
  });

  it("covers every donation kind with a positive interval", () => {
    for (const days of Object.values(DONATION_INTERVAL_DAYS)) {
      expect(days).toBeGreaterThan(0);
    }
  });
});

describe("nextEligibleAt", () => {
  it("adds the whole-blood interval to the donation date", () => {
    const donated = new Date("2026-06-01T10:30:00.000Z");
    expect(nextEligibleAt(donated)).toEqual(new Date("2026-08-30T10:30:00.000Z"));
  });

  it("uses the apheresis window when a kind is given", () => {
    const donated = new Date("2026-09-01T00:00:00.000Z");
    expect(nextEligibleAt(donated, "PLATELET_APHERESIS")).toEqual(new Date("2026-09-15T00:00:00.000Z"));
  });
});

describe("eligibilityWindow", () => {
  const donated = new Date("2026-09-01T09:00:00.000Z");

  it("treats a donor with no prior donation as eligible with no countdown", () => {
    const win = eligibilityWindow(new Date(), null);
    expect(win).toEqual({ eligible: true, nextEligibleAt: null, daysRemaining: 0 });
  });

  it("counts whole days remaining inside the window (ceil, PI-4)", () => {
    const now = new Date(donated.getTime() + 10 * DAY_MS + 60_000);
    const win = eligibilityWindow(now, donated);
    expect(win.eligible).toBe(false);
    expect(win.daysRemaining).toBe(80);
    expect(win.nextEligibleAt).toEqual(new Date(donated.getTime() + 90 * DAY_MS));
  });

  it("flips to eligible exactly at the boundary and floors days at 0", () => {
    const boundary = new Date(donated.getTime() + 90 * DAY_MS);
    const at = eligibilityWindow(boundary, donated);
    expect(at.eligible).toBe(true);
    expect(at.daysRemaining).toBe(0);

    const after = eligibilityWindow(new Date(boundary.getTime() + 5 * DAY_MS), donated);
    expect(after.eligible).toBe(true);
    expect(after.daysRemaining).toBe(0);
  });

  it("honours a non-default donation kind", () => {
    const inside = eligibilityWindow(new Date(donated.getTime() + 20 * DAY_MS), donated, "PLASMA_APHERESIS");
    expect(inside.eligible).toBe(false);
    expect(inside.daysRemaining).toBe(8);

    const outside = eligibilityWindow(new Date(donated.getTime() + 28 * DAY_MS), donated, "PLASMA_APHERESIS");
    expect(outside.eligible).toBe(true);
  });
});
