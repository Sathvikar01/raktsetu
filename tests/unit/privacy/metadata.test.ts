/**
 * PI-1 metadata hygiene tests: sanitizeMetadata must strip every
 * recipient-identifying key (case-insensitive, punctuation-insensitive,
 * recursively through nested objects) while preserving safe fields.
 */
import { describe, it, expect } from "vitest";
import { sanitizeMetadata } from "@/lib/json";

describe("sanitizeMetadata — forbidden keys", () => {
  it("strips all forbidden top-level keys case-insensitively", () => {
    const out = sanitizeMetadata({
      Name: "Alice",
      MRN: "MRN-0001",
      Aadhaar: "1234",
      PHONE: "+91-000",
      Email: "a@b.c",
      ADDRESS: "1 Road St",
      Diagnosis: "XYZ",
      NOTES: "free text",
      Bed: "12",
      Ward: "ICU",
      Password: "hunter2",
    });
    expect(out).toEqual({});
  });

  it("strips forbidden keys regardless of spacing/punctuation in the key", () => {
    const out = sanitizeMetadata({
      patient_name: "Alice",
      "phone-number": "+91-000",
      "Medical Record Number": "MRN-1",
      "clinical notes!": "text",
      "E-mail": "x@y.z",
      "ADDRESS:": "1 Road St",
      "Aadhaar#": "1234",
    });
    expect(out).toEqual({});
  });

  it("sanitizes nested objects recursively", () => {
    const out = sanitizeMetadata({
      meta: { name: "Alice", city: "Pune", deep: { mrn: "M-1", count: 3 } },
      count: 2,
    });
    expect(out).toEqual({ meta: { city: "Pune", deep: { count: 3 } }, count: 2 });
  });
});

describe("sanitizeMetadata — safe data survives", () => {
  it("keeps whitelisted coarse keys untouched", () => {
    const row = {
      categoryCode: "SURGERY",
      ageBand: "18-40",
      facilityCity: "Pune",
      occurredOn: "2026-08-01",
      componentType: "RBC",
      grantedLevel: "BROAD_PURPOSE",
    };
    expect(sanitizeMetadata(row)).toEqual(row);
  });

  it("preserves non-string primitive values and nulls", () => {
    const out = sanitizeMetadata({ count: 3, ratio: 0.5, ok: true, empty: null });
    expect(out).toEqual({ count: 3, ratio: 0.5, ok: true, empty: null });
  });

  it("returns an empty object when every key was forbidden", () => {
    expect(sanitizeMetadata({ name: "x", phone: "y" })).toEqual({});
  });
});

describe("sanitizeMetadata — fail-closed edges", () => {
  it.each(["a string", 42, null, undefined, true])(
    "non-object input (%p) yields an empty object",
    (v) => {
      expect(sanitizeMetadata(v)).toEqual({});
    }
  );

  it("treats arrays of objects conservatively (no per-index leak surface)", () => {
    const out = sanitizeMetadata({ items: [{ name: "Alice" }] });
    // Arrays are not a documented carrier for metadata; nothing usable escapes.
    expect(JSON.stringify(out)).not.toContain("Alice");
  });
});
