/**
 * Deterministic in-memory store + shared helpers for the mock adapters.
 * Stores are plain injectable objects (no network, no randomness at read time)
 * so simulator runs and future tests are fully reproducible.
 */
import { AdapterError, type NormalizedEvent } from "./adapter";
import {
  COMPONENT_TYPES,
  EVENT_TYPES,
  type ComponentType,
  type EventType,
} from "@/packages/schemas/events";

/** A raw lifecycle record as an upstream system might emit it (loose key aliases). */
export type MockRawEvent = Record<string, unknown>;

export interface MockComponentRecord {
  ref: string;
  componentType: string; // validated against COMPONENT_TYPES on read
}

export interface MockDonationRecord {
  ref: string; // external donation id
  din: string | null; // ISBT 128 DIN when issued
  donatedAt: string; // ISO timestamp — kept as string so stores stay JSON-safe
  components: MockComponentRecord[];
}

export interface MockSystemStore {
  donations: MockDonationRecord[];
  /** ref = the donation or component ref the raw event belongs to. */
  events: Array<MockRawEvent & { ref: string }>;
  knownIdentifiers: string[];
}

export function makeEmptyMockStore(): MockSystemStore {
  return { donations: [], events: [], knownIdentifiers: [] };
}

const EVENT_TYPE_SET = new Set<string>(EVENT_TYPES);
const COMPONENT_TYPE_SET = new Set<string>(COMPONENT_TYPES);

function pad(value: number, width: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(width, "0");
}

/**
 * ISBT-style Donation Identification Number:
 * `W` + 2-digit year + 3-digit day-of-year + zero-padded serial.
 * UTC arithmetic keeps the day-of-year deterministic across timezones.
 */
export function generateIsbtDin(when: Date, serial: number): string {
  const year = when.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const doy = Math.floor((Date.UTC(year, when.getUTCMonth(), when.getUTCDate()) - jan1) / 86_400_000) + 1;
  return `W${pad(year % 100, 2)}${pad(doy, 3)}${pad(serial % 10000, 4)}`;
}

const ALIAS_KEYS = new Set([
  "event_type", "type", "event",
  "external_event_id", "event_id", "id",
  "occurred_at", "time", "timestamp", "at",
]);

/**
 * Normalize a loose upstream dict into a NormalizedEvent. Accepts canonical
 * keys and common aliases (`type`/`event`, `id`, `time`/`timestamp`);
 * anything unmappable or invalid throws AdapterError (never guesses).
 */
export function normalizeRawEvent(raw: unknown): NormalizedEvent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AdapterError("Event payload must be an object");
  }
  const r = raw as Record<string, unknown>;

  const rawType = r["event_type"] ?? r["type"] ?? r["event"];
  if (typeof rawType !== "string" || !EVENT_TYPE_SET.has(rawType)) {
    throw new AdapterError(`Unknown event type: ${String(rawType)}`);
  }

  const rawId = r["external_event_id"] ?? r["event_id"] ?? r["id"];
  if (typeof rawId !== "string" || rawId.length === 0) {
    throw new AdapterError("Missing external_event_id");
  }
  if (rawId.length > 128) throw new AdapterError("external_event_id too long");

  const rawTime = r["occurred_at"] ?? r["time"] ?? r["timestamp"] ?? r["at"];
  const occurred =
    rawTime instanceof Date
      ? rawTime
      : typeof rawTime === "string" || typeof rawTime === "number"
        ? new Date(rawTime)
        : null;
  if (!occurred || Number.isNaN(occurred.getTime())) {
    throw new AdapterError(`Invalid occurred_at for event ${rawId}`);
  }

  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === "ref" || ALIAS_KEYS.has(k) || ALIAS_KEYS.has(k.toLowerCase())) continue;
    payload[k] = v;
  }

  return {
    external_event_id: rawId,
    event_type: rawType as EventType,
    occurred_at: occurred,
    ...(Object.keys(payload).length > 0 ? { payload } : {}),
  };
}

export function assertComponentType(componentType: string): ComponentType {
  if (!COMPONENT_TYPE_SET.has(componentType)) {
    throw new AdapterError(`Unknown component type: ${componentType}`);
  }
  return componentType as ComponentType;
}

export interface AddMockDonationInput {
  ref: string;
  donatedAt: Date | string;
  din?: string | null;
}

export function addMockDonation(store: MockSystemStore, input: AddMockDonationInput): MockDonationRecord {
  if (store.donations.some((d) => d.ref === input.ref)) {
    throw new AdapterError(`Duplicate mock donation ref: ${input.ref}`);
  }
  const when = input.donatedAt instanceof Date ? input.donatedAt : new Date(input.donatedAt);
  if (Number.isNaN(when.getTime())) throw new AdapterError(`Invalid donatedAt for ${input.ref}`);
  const record: MockDonationRecord = {
    ref: input.ref,
    din: input.din ?? generateIsbtDin(when, store.donations.length + 1),
    donatedAt: when.toISOString(),
    components: [],
  };
  store.donations.push(record);
  store.knownIdentifiers.push(input.ref);
  return record;
}

export function addMockComponent(
  store: MockSystemStore,
  donationRef: string,
  component: MockComponentRecord
): MockComponentRecord {
  const donation = store.donations.find((d) => d.ref === donationRef);
  if (!donation) throw new AdapterError(`Unknown mock donation ref: ${donationRef}`);
  assertComponentType(component.componentType); // fail fast on writes too
  donation.components.push({ ...component });
  store.knownIdentifiers.push(component.ref);
  return component;
}

export function addMockEvents(store: MockSystemStore, ref: string, events: MockRawEvent[]): void {
  for (const e of events) {
    normalizeRawEvent(e); // validate eagerly so bad records never enter the store
    store.events.push({ ...e, ref });
  }
  store.knownIdentifiers.push(ref);
}
