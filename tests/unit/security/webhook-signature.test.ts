/**
 * Webhook signature verification — pure crypto paths (no DB).
 * HMAC-SHA256 over `${timestamp}.${rawBody}`; constant-time compare;
 * replay window enforcement; fail-closed on every malformed input.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hmacSha256Hex, verifySignedRequest } from "@/lib/crypto";

const KEY_ID = "rk_testkey";
const SECRET = "partner-secret-value";
const BODY = JSON.stringify({ external_event_id: "evt-1", event_type: "DONATION_COLLECTED" });

const nowSec = (): string => String(Math.floor(Date.now() / 1000));
const sign = (ts: string, body: string, secret: string = SECRET): string =>
  hmacSha256Hex(secret, `${ts}.${body}`);

function check(
  headers: { keyId?: string | null; timestamp?: string | null; signature?: string | null },
  body = BODY,
  windowSeconds?: number
) {
  return verifySignedRequest(body, headers, (keyId) => (keyId === KEY_ID ? SECRET : null), windowSeconds);
}

describe("verifySignedRequest", () => {
  it("accepts a correctly signed request", () => {
    const ts = nowSec();
    const result = check({ keyId: KEY_ID, timestamp: ts, signature: sign(ts, BODY) });
    expect(result).toEqual({ ok: true });
  });

  it("accepts uppercase hex signatures (case-insensitive compare)", () => {
    const ts = nowSec();
    const result = check({ keyId: KEY_ID, timestamp: ts, signature: sign(ts, BODY).toUpperCase() });
    expect(result.ok).toBe(true);
  });

  it("rejects with MISSING_HEADERS when any header is absent", () => {
    const ts = nowSec();
    expect(check({ timestamp: ts, signature: sign(ts, BODY) }).reason).toBe("MISSING_HEADERS");
    expect(check({ keyId: KEY_ID, signature: sign(ts, BODY) }).reason).toBe("MISSING_HEADERS");
    expect(check({ keyId: KEY_ID, timestamp: ts }).reason).toBe("MISSING_HEADERS");
    expect(check({}).reason).toBe("MISSING_HEADERS");
  });

  it("rejects non-numeric timestamps as BAD_TIMESTAMP", () => {
    const result = check({ keyId: KEY_ID, timestamp: "not-a-number", signature: "00" });
    expect(result.reason).toBe("BAD_TIMESTAMP");
  });

  it("rejects stale timestamps beyond the replay window", () => {
    const stale = String(Math.floor(Date.now() / 1000) - 301);
    const result = check({ keyId: KEY_ID, timestamp: stale, signature: sign(stale, BODY) });
    expect(result.reason).toBe("BAD_TIMESTAMP");
  });

  it("rejects far-future timestamps beyond the replay window", () => {
    const future = String(Math.floor(Date.now() / 1000) + 400);
    const result = check({ keyId: KEY_ID, timestamp: future, signature: sign(future, BODY) });
    expect(result.reason).toBe("BAD_TIMESTAMP");
  });

  it("honors a custom replay window", () => {
    const skewed = String(Math.floor(Date.now() / 1000) - 60);
    const tooOld = check(
      { keyId: KEY_ID, timestamp: skewed, signature: sign(skewed, BODY) },
      BODY,
      10
    );
    expect(tooOld.reason).toBe("BAD_TIMESTAMP");

    const withinWindow = check(
      { keyId: KEY_ID, timestamp: skewed, signature: sign(skewed, BODY) },
      BODY,
      120
    );
    expect(withinWindow.ok).toBe(true);
  });

  it("rejects unknown keys without leaking whether the key exists", () => {
    const ts = nowSec();
    const result = check({ keyId: "rk_unknown", timestamp: ts, signature: sign(ts, BODY) });
    expect(result.reason).toBe("UNKNOWN_KEY");
  });

  it("rejects signatures made with the wrong secret", () => {
    const ts = nowSec();
    const result = verifySignedRequest(BODY, { keyId: KEY_ID, timestamp: ts, signature: sign(ts, BODY, "other-secret") }, () => SECRET);
    expect(result.reason).toBe("BAD_SIGNATURE");
  });

  it("rejects tampered bodies (signature over different bytes)", () => {
    const ts = nowSec();
    const tampered = BODY.replace("evt-1", "evt-2");
    const result = verifySignedRequest(tampered, { keyId: KEY_ID, timestamp: ts, signature: sign(ts, BODY) }, () => SECRET);
    expect(result.reason).toBe("BAD_SIGNATURE");
  });

  it("binds the signature to the exact timestamp string sent", () => {
    // Same instant, different string representation ("+0.5") must fail.
    const ts = nowSec();
    const paddedTs = `${ts}.5`;
    const result = check({ keyId: KEY_ID, timestamp: paddedTs, signature: sign(ts, BODY) });
    expect(result.reason).toBe("BAD_SIGNATURE");
  });
});
