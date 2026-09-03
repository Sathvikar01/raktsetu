import type { ComponentType } from "@/packages/schemas/events";

/**
 * Standard component shelf lives (days) used to stamp BloodComponent.expiresAt
 * at creation. Whole blood and OTHER carry the conservative 35-day anticoagulant
 * limit; platelets are the binding constraint at 5 days. Plasma is stored frozen
 * (12 months). Blood banks whose LIMS disagrees can still correct reality via
 * COMPONENT_EXPIRED events — this only seeds the derived expiresAt.
 */
export const SHELF_LIFE_DAYS: Record<ComponentType, number> = {
  RBC: 42,
  PLATELET: 5,
  PLASMA: 365,
  WHOLE_BLOOD: 35,
  OTHER: 35,
};

export function computeExpiry(componentType: string, preparedAt: Date): Date | null {
  const days = SHELF_LIFE_DAYS[componentType as ComponentType];
  if (!days) return null;
  return new Date(preparedAt.getTime() + days * 86_400_000);
}
