/**
 * Mock hospital adapter — deterministic, in-memory, no network.
 * Hospitals do not own donations (the collecting blood bank does), so
 * getDonation() is always null; components are tracked as received units.
 */
import type { BloodSystemAdapter, ComponentSnapshot, DonationSnapshot, NormalizedEvent } from "./adapter";
import {
  assertComponentType,
  normalizeRawEvent,
  type MockSystemStore,
} from "./mock-store";

export class MockHospitalAdapter implements BloodSystemAdapter {
  readonly id = "mock-hospital";
  readonly kind = "HOSPITAL" as const;

  constructor(private readonly store: MockSystemStore) {}

  async getDonation(_ref: string): Promise<DonationSnapshot | null> {
    return null; // hospitals never own donations — fail closed rather than guess
  }

  async getComponents(ref: string): Promise<ComponentSnapshot[]> {
    const found: ComponentSnapshot[] = [];
    for (const d of this.store.donations) {
      for (const c of d.components) {
        if (c.ref === ref) {
          found.push({ externalComponentId: c.ref, componentType: assertComponentType(c.componentType) });
        }
      }
    }
    return found;
  }

  async getLifecycleEvents(ref: string): Promise<NormalizedEvent[]> {
    return this.store.events.filter((e) => e.ref === ref).map(normalizeRawEvent);
  }

  async verifyIdentifier(id: string): Promise<boolean> {
    if (this.store.knownIdentifiers.includes(id)) return true;
    return this.getComponents(id).then((c) => c.length > 0);
  }

  normalizeEvent(raw: unknown): NormalizedEvent {
    return normalizeRawEvent(raw);
  }
}
