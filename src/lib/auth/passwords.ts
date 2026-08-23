import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384, R = 8, P = 1, KEYLEN = 64;

/** Format: scrypt$N$r$p$saltB64$hashB64 — no native deps, self-hostable. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 10) issues.push("minLength");
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) issues.push("lettersAndNumbers");
  return issues;
}
