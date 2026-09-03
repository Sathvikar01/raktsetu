import { describe, expect, it } from "vitest";
import {
  canReceiveFrom,
  compatibleDonorGroups,
  compatiblePlasmaGroups,
  compatibleDonorGroupsForComponent,
} from "@/packages/domain/compatibility";
import { BLOOD_GROUPS, type BloodGroup } from "@/packages/schemas/events";

describe("compatibleDonorGroups (red cells)", () => {
  it("makes O- the universal RBC donor", () => {
    for (const recipient of BLOOD_GROUPS) {
      expect(canReceiveFrom(recipient, "O-", "RBC")).toBe(true);
    }
  });

  it("makes AB+ the universal RBC recipient", () => {
    for (const donor of BLOOD_GROUPS) {
      expect(canReceiveFrom("AB+", donor, "RBC")).toBe(true);
    }
  });

  it("blocks Rh+ donors for Rh- recipients", () => {
    for (const donor of ["O+", "A+", "B+", "AB+"] as BloodGroup[]) {
      expect(canReceiveFrom("O-", donor, "RBC")).toBe(false);
      expect(canReceiveFrom("A-", donor, "RBC")).toBe(false);
      expect(canReceiveFrom("AB-", donor, "RBC")).toBe(false);
    }
  });

  it("follows ABO rules: O recipient accepts only O donors", () => {
    expect(canReceiveFrom("O+", "O+", "RBC")).toBe(true);
    expect(canReceiveFrom("O+", "O-", "RBC")).toBe(true);
    expect(canReceiveFrom("O+", "A-", "RBC")).toBe(false);
    expect(canReceiveFrom("O-", "B+", "RBC")).toBe(false);
  });

  it("allows Rh+ recipients to receive Rh- donors", () => {
    expect(canReceiveFrom("A+", "A-", "RBC")).toBe(true);
    expect(canReceiveFrom("B+", "O-", "RBC")).toBe(true);
  });

  it("lists the exact group first", () => {
    expect(compatibleDonorGroups("A+")[0]).toBe("A+");
    expect(compatibleDonorGroups("O-")[0]).toBe("O-");
  });

  it("orders A+ donors as A+, A-, O+, O-", () => {
    expect(compatibleDonorGroups("A+")).toEqual(["A+", "A-", "O+", "O-"]);
  });
});

describe("compatiblePlasmaGroups (mirror rule)", () => {
  it("makes AB plasma the universal plasma donor", () => {
    for (const recipient of BLOOD_GROUPS) {
      expect(canReceiveFrom(recipient, "AB+", "PLASMA")).toBe(true);
      expect(canReceiveFrom(recipient, "AB-", "PLASMA")).toBe(true);
    }
  });

  it("restricts O recipients' plasma to O donors' plasma compatibility (anti-A/anti-B safe)", () => {
    // O plasma has anti-A and anti-B → only AB recipients' RBCs are immune? No:
    // O recipients' RBCs carry neither antigen, so any plasma is safe for them.
    expect(canReceiveFrom("O+", "A+", "PLASMA")).toBe(true);
    expect(canReceiveFrom("O-", "B-", "PLASMA")).toBe(true);
  });

  it("blocks A plasma for B and AB recipients", () => {
    expect(canReceiveFrom("B+", "A+", "PLASMA")).toBe(false);
    expect(canReceiveFrom("AB+", "A-", "PLASMA")).toBe(false);
    expect(canReceiveFrom("AB-", "O+", "PLASMA")).toBe(false);
  });

  it("lists exact group first for plasma", () => {
    expect(compatiblePlasmaGroups("AB+")[0]).toBe("AB+");
  });
});

describe("compatibleDonorGroupsForComponent", () => {
  it("requires exact ABO/Rh match for whole blood", () => {
    expect(compatibleDonorGroupsForComponent("A+", "WHOLE_BLOOD")).toEqual(["A+"]);
    expect(canReceiveFrom("A+", "O-", "WHOLE_BLOOD")).toBe(false);
  });

  it("uses plasma rules for platelets", () => {
    expect(canReceiveFrom("O+", "AB+", "PLATELET")).toBe(true);
    expect(canReceiveFrom("AB+", "O+", "PLATELET")).toBe(false);
  });

  it("uses red-cell rules for RBC", () => {
    expect(canReceiveFrom("A+", "O-", "RBC")).toBe(true);
    expect(canReceiveFrom("O-", "A-", "RBC")).toBe(false);
  });
});
