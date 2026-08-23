/**
 * Mock blood-bank adapter — deterministic, in-memory, no network.
 * Reads from an injected MockSystemStore so simulator runs and tests can
 * seed exactly the scenario they need. DINs are ISBT-style via generateIsbtDin.
 */
import type { BloodSystemAdapter, ComponentSnapshot, DonationSnapshot, NormalizedEvent } from "./adapter";
import {
  assertComponentType,
  normalizeRawEvent,
  type MockSystemStore,
} from "./mock-store";

export class MockBloodBankAdapter implements BloodSystemAdapter {
  readonly id = "mock-blood-bank";
  readonly kind = "BLOOD_BANK" as const;

  constructor(private readonly store: MockSystemStore) {}

  async getDonation(ref: string): Promise<DonationSnapshot | null> {
    const d = this.store.donations.find((x) => x.ref === ref);
    if (!d) return null;
    return {
      externalDonationId: d.ref,
      din: d.din,
      donatedAt: new Date(d.donatedAt),
      components: d.components.map((c): ComponentSnapshot => ({
        externalComponentId: c.ref,
        componentType: assertComponentType(c.componentType),
      })),
    };
  }

  async getComponents(donationRef: string): Promise<ComponentSnapshot[]> {
    const donation = await this.getDonation(donationRef);
    return donation?.components ?? [];
  }

  async getLifecycleEvents(ref: string): Promise<NormalizedEvent[]> {
    // Events recorded against the donation itself or any of its components.
    const donation = this.store.donations.find((d) => d.ref === ref);
    const relatedRefs = new Set<string>([ref, ...(donation?.components.map((c) => c.ref) ?? [])]);
    return this.store.events.filter((e) => relatedRefs.has(e.ref)).map(normalizeRawEvent);
  }

  async verifyIdentifier(id: string): Promise<boolean> {
    if (this.store.knownIdentifiers.includes(id)) return true;
    return this.store.donations.some(
      (d) => d.ref === id || d.components.some((c) => c.ref === id)
    );
  }

  normalizeEvent(raw: unknown): NormalizedEvent {
    return normalizeRawEvent(raw);
  }
}
