import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/lib/env";

function key32(salt: Buffer): Buffer {
  return createHash("sha256").update(Buffer.concat([Buffer.from(env.APP_SECRET), salt])).digest();
}

// ---------------------------------------------------------------------------
// Hashing / HMAC
// ---------------------------------------------------------------------------

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hmacSha256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashWithPepper(token: string): string {
  return hmacSha256Hex(env.APP_SECRET, token);
}

// ---------------------------------------------------------------------------
// Integration credential secrets at rest (AES-256-GCM)
// ---------------------------------------------------------------------------

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key32(iv), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key32(Buffer.from(ivB64, "base64")), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** AES-GCM blobs are `iv:tag:ciphertext` (base64). TOTP base32 never contains `:`. */
export function looksEncryptedSecret(stored: string): boolean {
  const parts = stored.split(":");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/** Decrypt AES-GCM material, or return legacy plaintext (e.g. unmigrated TOTP). */
export function decryptSecretFlexible(stored: string): string {
  if (!looksEncryptedSecret(stored)) return stored;
  try {
    return decryptSecret(stored);
  } catch {
    return stored;
  }
}

// ---------------------------------------------------------------------------
// Signed partner requests: HMAC over `${timestamp}.${rawBody}`
// Headers: X-RaktSetu-Key (keyId), X-RaktSetu-Timestamp, X-RaktSetu-Signature
// ---------------------------------------------------------------------------

export interface SignatureCheck {
  ok: boolean;
  reason?:
    | "MISSING_HEADERS"
    | "BAD_TIMESTAMP"
    | "BAD_SIGNATURE"
    | "UNKNOWN_KEY"
    | "REVOKED_KEY";
}

export function verifySignedRequest(
  rawBody: string,
  headers: { keyId?: string | null; timestamp?: string | null; signature?: string | null },
  resolveSecret: (keyId: string) => string | null | undefined,
  windowSeconds = env.REPLAY_WINDOW_SECONDS
): SignatureCheck {
  const { keyId, timestamp, signature } = headers;
  if (!keyId || !timestamp || !signature) return { ok: false, reason: "MISSING_HEADERS" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "BAD_TIMESTAMP" };
  const skew = Math.abs(Date.now() / 1000 - ts);
  if (skew > windowSeconds) return { ok: false, reason: "BAD_TIMESTAMP" };
  const secret = resolveSecret(keyId);
  if (!secret) return { ok: false, reason: "UNKNOWN_KEY" };
  const expected = hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return safeEqual(expected, signature.toLowerCase()) ? { ok: true } : { ok: false, reason: "BAD_SIGNATURE" };
}

/** Constant-time Bearer comparison. */
export function bearerMatches(authorization: string | null, secret: string): boolean {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) return false;
  return safeEqual(authorization.slice(prefix.length), secret);
}
