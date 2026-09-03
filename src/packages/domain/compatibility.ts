import type { BloodGroup, ComponentType } from "@/packages/schemas/events";

/**
 * ABO/Rh compatibility engine (rule-based, pure).
 *
 * RBC / whole blood follow the standard transfusion rules: the recipient's
 * plasma antibodies must not attack donor RBC antigens, and Rh-negative
 * recipients must not receive Rh-positive red cells.
 * Plasma (and platelets, which carry enough plasma to follow the same mirror
 * rule in emergency practice) is the reverse: donor plasma antibodies must not
 * attack the recipient's RBC antigens — AB plasma is universal, O plasma is
 * restricted to O recipients.
 *
 * Pure domain logic: no data access, no clinical judgement beyond the closed
 * rules below. Final compatibility is always confirmed by transfusion
 * professionals at the blood bank.
 */

interface AboRh {
  abo: "O" | "A" | "B" | "AB";
  rh: "+" | "-";
}

export function parseBloodGroup(group: BloodGroup): AboRh {
  const rh: "+" | "-" = group.endsWith("-") ? "-" : "+";
  const abo = group.slice(0, -1) as AboRh["abo"];
  return { abo, rh };
}

const ABO_RBC_DONORS: Record<AboRh["abo"], AboRh["abo"][]> = {
  O: ["O"],
  A: ["O", "A"],
  B: ["O", "B"],
  AB: ["O", "A", "B", "AB"],
};

// Mirror rule for plasma / platelets (donor plasma antibodies vs recipient RBCs).
const ABO_PLASMA_DONORS: Record<AboRh["abo"], AboRh["abo"][]> = {
  O: ["O", "A", "B", "AB"], // O recipient RBCs carry no A/B antigens — any plasma is safe
  A: ["A", "AB"],
  B: ["B", "AB"],
  AB: ["AB"],
};

/** Ranking: exact match first, then same ABO, then matching Rh. */
function preferRecipientOrder(recipient: BloodGroup): (a: BloodGroup, b: BloodGroup) => number {
  const rec = parseBloodGroup(recipient);
  return (a, b) => {
    if (a === recipient) return -1;
    if (b === recipient) return 1;
    const pa = parseBloodGroup(a);
    const pb = parseBloodGroup(b);
    const aboScore = (g: typeof pa) => (g.abo === rec.abo ? 0 : 1);
    const rhScore = (g: typeof pa) => (g.rh === rec.rh ? 0 : 1);
    return aboScore(pa) - aboScore(pb) || rhScore(pa) - rhScore(pb);
  };
}

/** Donor groups whose red cells can go to this recipient. Exact match first. */
export function compatibleDonorGroups(recipient: BloodGroup): BloodGroup[] {
  const { abo, rh } = parseBloodGroup(recipient);
  const donorAbo = ABO_RBC_DONORS[abo];
  const donorRh: Array<"+" | "-"> = rh === "+" ? ["+", "-"] : ["-"];
  const out: BloodGroup[] = [];
  for (const a of donorAbo) {
    for (const r of donorRh) {
      out.push(`${a}${r}` as BloodGroup);
    }
  }
  return out.sort(preferRecipientOrder(recipient));
}

/** Donor groups whose plasma/platelets can go to this recipient. Exact match first. */
export function compatiblePlasmaGroups(recipient: BloodGroup): BloodGroup[] {
  const { abo } = parseBloodGroup(recipient);
  const donorAbo = ABO_PLASMA_DONORS[abo];
  const out: BloodGroup[] = [];
  for (const a of donorAbo) {
    for (const r of ["+", "-"] as const) {
      out.push(`${a}${r}` as BloodGroup);
    }
  }
  return out.sort(preferRecipientOrder(recipient));
}

/**
 * Compatibility for a requested component type. Whole blood must be an exact
 * ABO/Rh match (donor RBCs + donor plasma transfused together).
 */
export function compatibleDonorGroupsForComponent(
  recipient: BloodGroup,
  componentType: ComponentType
): BloodGroup[] {
  if (componentType === "PLASMA" || componentType === "PLATELET") {
    return compatiblePlasmaGroups(recipient);
  }
  if (componentType === "WHOLE_BLOOD" || componentType === "OTHER") {
    return [recipient];
  }
  return compatibleDonorGroups(recipient);
}

export function canReceiveFrom(
  recipient: BloodGroup,
  donor: BloodGroup,
  componentType: ComponentType = "RBC"
): boolean {
  return compatibleDonorGroupsForComponent(recipient, componentType).includes(donor);
}
