import "server-only";
/**
 * TOTP (RFC 6238) / HOTP (RFC 4226) with zero external dependencies.
 * SHA-1 + 30s steps + 6 digits: the default configuration of every common
 * authenticator app. Verification allows one step of clock drift in each
 * direction and rejects replayed or stale counters (the caller persists the
 * highest-seen counter).
 */
import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_MS = 30_000;
const CODE_DIGITS = 6;
const ALLOWED_DRIFT_STEPS = 1;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** HOTP digest to decimal code (RFC 4226 dynamic truncation). */
function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buf).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return (binary % 10 ** CODE_DIGITS).toString().padStart(CODE_DIGITS, "0");
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function currentTotpCounter(now: number = Date.now()): number {
  return Math.floor(now / STEP_MS);
}

export function totpCodeAt(secret: string, counter: number): string {
  return hotp(base32Decode(secret), counter);
}

export interface TotpVerifyResult {
  ok: boolean;
  /** Counter of the matching step when ok. Persist it for replay rejection. */
  counter?: number;
}

export function verifyTotp(
  secret: string,
  code: string,
  lastSeenCounter: number,
  now: number = Date.now()
): TotpVerifyResult {
  const cleaned = code.replace(/\D/g, "");
  if (cleaned.length !== CODE_DIGITS) return { ok: false };
  const key = base32Decode(secret);
  const base = currentTotpCounter(now);
  for (let drift = -ALLOWED_DRIFT_STEPS; drift <= ALLOWED_DRIFT_STEPS; drift++) {
    const counter = base + drift;
    if (counter <= lastSeenCounter) continue; // replay or stale step
    if (hotp(key, counter) === cleaned) return { ok: true, counter };
  }
  return { ok: false };
}

/** otpauth:// provisioning URI for authenticator apps. */
export function otpauthUri(
  secret: string,
  accountName: string,
  issuer: string
): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(CODE_DIGITS),
    period: String(STEP_MS / 1000),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
