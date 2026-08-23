/**
 * PI invariant tests for the deterministic disclosure engine (PI-3, PI-13).
 * Every branch of decideDisclosure() must behave exactly as specified:
 * fail closed, degrade gracefully, never guess.
 */
import { describe, it, expect, vi } from "vitest";

// The engine imports @/lib/env which marks itself server-only; under vitest's
// node environment there is no RSC runtime, so stub the marker package out.
vi.mock("server-only", () => ({}));

import {
  decideDisclosure,
  type ConsentSnapshot,
  type DisclosureInput,
  type DisclosureOutput,
} from "@/packages/privacy/engine";
import { env } from "@/lib/env";

function consent(over: Partial<ConsentSnapshot> = {}): ConsentSnapshot {
  return {
    level: "BROAD_PURPOSE",
    category: "SURGERY",
    ageBand: null,
    patientConsentVerified: true,
    verifiedAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: null,
    ...over,
  };
}

function input(over: Partial<DisclosureInput> = {}): DisclosureInput {
  return {
    eventType: "COMPONENT_TRANSFUSED",
    componentType: "RBC",
    verificationStatus: "VERIFIED",
    consent: consent(),
    cohortSize: null,
    ...over,
  };
}

const GENERIC_KEY = "privacy.transfusedGeneric";
const BROAD_KEY = "privacy.transfusedBroadPrefix";
const LIMITED_KEY = "privacy.transfusedLimited";
const AWAITING_KEY = "privacy.awaitingVerification";

function expectGeneric(out: DisclosureOutput, reason: string | null = null): void {
  expect(out.grantedLevel).toBe("NONE");
  expect(out.messageKey).toBe(GENERIC_KEY);
  expect(out.params).toEqual({});
  expect(out.degradedReason).toBe(reason);
}

describe("decideDisclosure — non-disclosure branches", () => {
  it("non-transfusion events yield null messageKey with NOT_TRANSFUSION", () => {
    const out = decideDisclosure(input({ eventType: "DONATION_COLLECTED" }));
    expect(out).toEqual({
      grantedLevel: "NONE",
      messageKey: null,
      params: {},
      degradedReason: "NOT_TRANSFUSION",
    });
  });

  it.each(["DONATION_COLLECTED", "COMPONENT_EXPIRED", "EVENT_CORRECTION"] as const)(
    "%s is never treated as a transfusion",
    (eventType) => {
      const out = decideDisclosure(input({ eventType }));
      expect(out.degradedReason).toBe("NOT_TRANSFUSION");
      expect(out.messageKey).toBeNull();
    }
  );

  it("PENDING event degrades to awaiting-verification copy (EVENT_NOT_VERIFIED)", () => {
    const out = decideDisclosure(
      input({
        verificationStatus: "PENDING",
        consent: consent({ level: "LIMITED_ANON", ageBand: "18-40" }),
        cohortSize: 50,
      })
    );
    expect(out.grantedLevel).toBe("NONE");
    expect(out.messageKey).toBe(AWAITING_KEY);
    expect(out.degradedReason).toBe("EVENT_NOT_VERIFIED");
    expect(out.params).toEqual({});
  });

  it("REJECTED event gets the same neutral awaiting-verification treatment (never negative facts)", () => {
    const out = decideDisclosure(input({ verificationStatus: "REJECTED" }));
    expect(out.messageKey).toBe(AWAITING_KEY);
    expect(out.degradedReason).toBe("EVENT_NOT_VERIFIED");
  });
});

describe("decideDisclosure — consent gate (PI-2)", () => {
  it("no consent record at all yields the generic LEVEL 0 statement", () => {
    const out = decideDisclosure(input({ consent: null }));
    expectGeneric(out);
  });

  it("explicit NONE-level consent yields the generic statement without a degradation reason", () => {
    const out = decideDisclosure(input({ consent: consent({ level: "NONE" }) }));
    expectGeneric(out);
  });

  it("NONE-level consent with unverified patient consent stays generic (no misleading reason)", () => {
    const out = decideDisclosure(
      input({ consent: consent({ level: "NONE", patientConsentVerified: false }) })
    );
    expectGeneric(out);
  });

  it("unverified patient consent on a real level degrades to generic + PATIENT_CONSENT_UNVERIFIED", () => {
    const out = decideDisclosure(
      input({ consent: consent({ level: "LIMITED_ANON", ageBand: "18-40", patientConsentVerified: false }) })
    );
    expectGeneric(out, "PATIENT_CONSENT_UNVERIFIED");
  });

  it("expired consent fails closed with CONSENT_EXPIRED", () => {
    const out = decideDisclosure(
      input({
        consent: consent({ expiresAt: new Date(Date.now() - 60_000) }),
      })
    );
    expectGeneric(out, "CONSENT_EXPIRED");
  });

  it("consent with a future expiry is not treated as expired", () => {
    const out = decideDisclosure(
      input({ consent: consent({ expiresAt: new Date(Date.now() + 3_600_000) }) })
    );
    expect(out.degradedReason).toBeNull();
    expect(out.messageKey).toBe(BROAD_KEY);
  });
});

describe("decideDisclosure — category validation (fail closed)", () => {
  it("unknown category string degrades to generic + CATEGORY_UNKNOWN", () => {
    const out = decideDisclosure(
      input({ consent: consent({ category: "ORGAN_TRANSPLANT" }) })
    );
    expectGeneric(out, "CATEGORY_UNKNOWN");
  });

  it("missing category on a non-NONE level degrades to generic + CATEGORY_UNKNOWN", () => {
    const out = decideDisclosure(input({ consent: consent({ category: null }) }));
    expectGeneric(out, "CATEGORY_UNKNOWN");
  });

  it.each(["emergency care", "", "SURGERY ", "surgery"])(
    "non-canonical category %j is rejected, never coerced",
    (bad) => {
      const out = decideDisclosure(input({ consent: consent({ category: bad }) }));
      expect(out.degradedReason).toBe("CATEGORY_UNKNOWN");
    }
  );
});

describe("decideDisclosure — BROAD_PURPOSE", () => {
  it("valid broad consent grants BROAD_PURPOSE with dictionary-reference params", () => {
    const out = decideDisclosure(input());
    expect(out.grantedLevel).toBe("BROAD_PURPOSE");
    expect(out.messageKey).toBe(BROAD_KEY);
    expect(out.degradedReason).toBeNull();
    expect(out.params).toEqual({
      component: "{components.RBC}",
      category: "{categories.SURGERY}",
    });
  });

  it("component type flows into the dictionary reference", () => {
    const out = decideDisclosure(input({ componentType: "PLASMA" }));
    expect(out.params["component"]).toBe("{components.PLASMA}");
  });

  it("unknown component type falls back to the OTHER label", () => {
    const out = decideDisclosure(input({ componentType: "SOMETHING_ELSE" }));
    expect(out.params["component"]).toBe("{components.OTHER}");
  });
});

describe("decideDisclosure — LIMITED_ANON k-anonymity floor (PI-4)", () => {
  it(`degrades to BROAD + COHORT_TOO_SMALL when cohort < PRIVACY_MIN_COHORT (${env.PRIVACY_MIN_COHORT})`, () => {
    expect(env.PRIVACY_MIN_COHORT).toBe(5); // pin the test-env contract
    const out = decideDisclosure(
      input({ consent: consent({ level: "LIMITED_ANON", ageBand: "18-40" }), cohortSize: 4 })
    );
    expect(out.grantedLevel).toBe("BROAD_PURPOSE");
    expect(out.messageKey).toBe(BROAD_KEY);
    expect(out.degradedReason).toBe("COHORT_TOO_SMALL");
    expect(out.params["component"]).toBe("{components.RBC}");
  });

  it("cohort exactly at the threshold grants LIMITED_ANON", () => {
    const out = decideDisclosure(
      input({ consent: consent({ level: "LIMITED_ANON", ageBand: "18-40" }), cohortSize: 5 })
    );
    expect(out.grantedLevel).toBe("LIMITED_ANON");
    expect(out.messageKey).toBe(LIMITED_KEY);
    expect(out.degradedReason).toBeNull();
    expect(out.params).toEqual({
      category: "{categories.SURGERY}",
      ageBand: "18-40",
    });
  });

  it("well above the threshold grants LIMITED_ANON", () => {
    const out = decideDisclosure(
      input({
        consent: consent({ level: "LIMITED_ANON", ageBand: "60+", category: "CANCER_CARE" }),
        cohortSize: 100,
      })
    );
    expect(out.grantedLevel).toBe("LIMITED_ANON");
    expect(out.params).toEqual({ category: "{categories.CANCER_CARE}", ageBand: "60+" });
  });

  it("missing age band on LIMITED_ANON degrades to BROAD + AGE_BAND_MISSING (never renders without the band)", () => {
    const out = decideDisclosure(
      input({ consent: consent({ level: "LIMITED_ANON", ageBand: null }), cohortSize: 25 })
    );
    expect(out.grantedLevel).toBe("BROAD_PURPOSE");
    expect(out.messageKey).toBe(BROAD_KEY);
    expect(out.degradedReason).toBe("AGE_BAND_MISSING");
  });

  it("invalid age band string on LIMITED_ANON degrades identically", () => {
    const out = decideDisclosure(
      input({ consent: consent({ level: "LIMITED_ANON", ageBand: "99-120" }), cohortSize: 25 })
    );
    expect(out.degradedReason).toBe("AGE_BAND_MISSING");
    expect(out.grantedLevel).toBe("BROAD_PURPOSE");
  });

  it("undefined cohort size counts as zero (fails closed)", () => {
    const out = decideDisclosure(
      input({ consent: consent({ level: "LIMITED_ANON", ageBand: "40-60" }), cohortSize: undefined })
    );
    expect(out.degradedReason).toBe("COHORT_TOO_SMALL");
  });

  it("BROAD_PURPOSE ignores cohort entirely (no k-anonymity requirement)", () => {
    const out = decideDisclosure(input({ cohortSize: 0 }));
    expect(out.grantedLevel).toBe("BROAD_PURPOSE");
    expect(out.degradedReason).toBeNull();
  });
});
