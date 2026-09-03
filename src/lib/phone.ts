import "server-only";
import { hmacSha256Hex, encryptSecret, decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";

/**
 * Phone-number handling for the donor network and emergency requests.
 *
 * Threat model: a phone number is enough to spam or de-anonymize a donor, so
 * it is stored BOTH ways —
 *  - `phoneEncrypted`: AES-256-GCM (APP_SECRET) — decryptable only for
 *    notification delivery or a requester callback after a donor accepts;
 *  - `phoneHash`: keyed HMAC — used for OTP lookup, throttling and duplicate
 *    detection without ever querying on ciphertext.
 * Rendered surfaces only ever see maskPhone() output (last 4 digits).
 */

const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Normalize a user-entered phone to E.164. Indian numbers (the platform's
 * primary deployment context) get +91 by default; anything already carrying
 * a + prefix is validated as-is. Returns null when the input can't be a
 * phone number — callers must treat that as validation failure.
 */
export function normalizePhone(raw: string, defaultCountryPrefix = "+91"): string | null {
  const stripped = raw.replace(/[\s\-().]/g, "");
  if (!stripped) return null;

  let candidate: string;
  if (stripped.startsWith("+")) {
    candidate = stripped;
  } else if (/^[1-9]\d{9}$/.test(stripped)) {
    // 10-digit national number (mobile prefixes 6-9 in India pass the first digit check)
    candidate = `${defaultCountryPrefix}${stripped}`;
  } else if (/^00\d{7,15}$/.test(stripped)) {
    candidate = `+${stripped.slice(2)}`;
  } else if (/^91\d{10}$/.test(stripped)) {
    candidate = `+${stripped}`;
  } else {
    return null;
  }
  return E164.test(candidate) ? candidate : null;
}

/** Irreversible keyed lookup key — safe to index and to throttle on. */
export function phoneHashKey(e164: string): string {
  return hmacSha256Hex(env.APP_SECRET, `phone:${e164}`).slice(0, 32);
}

export function encryptPhone(e164: string): string {
  return encryptSecret(e164);
}

export function decryptPhone(stored: string): string | null {
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}

/** The ONLY representation of a phone number allowed in UI/logs. */
export function maskPhone(e164: string): string {
  if (e164.length < 4) return "••••";
  return `••••• ${e164.slice(-4)}`;
}
