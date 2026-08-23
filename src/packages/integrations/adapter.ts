/**
 * Blood-system adapter contract (docs/architecture.md — Adapter architecture).
 * Adapters translate partner LIS/HIS payloads into RaktSetu's normalized event
 * vocabulary. Pure TypeScript — no server-only imports, no network.
 */
import type { ComponentType, EventType } from "@/packages/schemas/events";

export class AdapterError extends Error {
  constructor(message = "Unmappable adapter payload") {
    super(message);
    this.name = "AdapterError";
  }
}

export interface NormalizedEvent {
  external_event_id: string;
  event_type: EventType;
  occurred_at: Date;
  payload?: Record<string, unknown>;
}

export interface ComponentSnapshot {
  externalComponentId: string;
  componentType: ComponentType;
}

export interface DonationSnapshot {
  externalDonationId: string;
  din: string | null;
  donatedAt: Date;
  components: ComponentSnapshot[];
}

export interface BloodSystemAdapter {
  readonly id: string;
  readonly kind: "BLOOD_BANK" | "HOSPITAL";
  getDonation(ref: string): Promise<DonationSnapshot | null>;
  getComponents(donationRef: string): Promise<ComponentSnapshot[]>;
  getLifecycleEvents(ref: string): Promise<NormalizedEvent[]>;
  verifyIdentifier(id: string): Promise<boolean>;
  normalizeEvent(raw: unknown): NormalizedEvent;
}
