/**
 * JSON serialization helpers for portable schema (SQLite has no JSON type).
 * Stored fields are named *Json across the schema.
 */
export function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export function fromJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Recursively strip keys that must never be persisted/logged. */
const FORBIDDEN_KEYS = new Set([
  "name", "patientname", "recipientname", "mrn", "medicalrecordnumber",
  "aadhaar", "phone", "phonenumber", "email", "address", "bed", "ward",
  "notes", "diagnosis", "clinicalnotes", "password",
]);

export function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = k.toLowerCase().replace(/[^a-z]/g, "");
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (typeof v === "object" && v !== null) out[k] = sanitizeMetadata(v);
    else out[k] = v;
  }
  return out;
}
