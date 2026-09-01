import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/packages/database/client";
import { env } from "@/lib/env";
import { randomToken, hashWithPepper, safeEqual } from "@/lib/crypto";
import { CSRF_COOKIE, CSRF_FIELD, CSRF_HEADER } from "@/lib/auth/csrf-cookie";

export const SESSION_COOKIE = "rs_session";
export { CSRF_COOKIE, CSRF_FIELD, CSRF_HEADER };

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: "DONOR" | "ORG_STAFF" | "ORG_ADMIN" | "PLATFORM_ADMIN";
  donorProfileId: string | null;
}

const STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Staff/admin sessions are short-lived (12h) regardless of the donor TTL —
 * privileged roles must re-authenticate at least daily.
 *
 * Every login/registration yields EXACTLY ONE valid session: prior sessions
 * for the user are revoked in the same transaction that issues the new one.
 */
export async function createSession(userId: string): Promise<{ token: string; csrf: string }> {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const staff = user ? ["ORG_STAFF", "ORG_ADMIN", "PLATFORM_ADMIN"].includes(user.role) : false;
  const ttlMs = staff ? STAFF_SESSION_TTL_MS : env.SESSION_TTL_DAYS * 86_400_000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.session.create({
      data: { userId, tokenHash: hashWithPepper(token), expiresAt },
    }),
  ]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    expires: expiresAt,
  });
  // Readable by JS on purpose (double-submit CSRF pattern); not sensitive.
  jar.set(CSRF_COOKIE, csrf, {
    httpOnly: false,
    sameSite: "strict",
    secure: env.isProd,
    path: "/",
    expires: expiresAt,
  });
  return { token, csrf };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashWithPepper(token) },
    include: { user: { include: { donorProfile: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;
  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role as SessionUser["role"],
    donorProfileId: session.user.donorProfile?.id ?? null,
  };
}

/** Double-submit CSRF check (header or form field) against the readable cookie. */
export async function verifyCsrf(req?: Request, formData?: FormData): Promise<boolean> {
  const jar = await cookies();
  const cookieVal = jar.get(CSRF_COOKIE)?.value;
  if (!cookieVal) return false;
  const fromForm = formData ? String(formData.get(CSRF_FIELD) ?? "") : "";
  if (fromForm) return safeEqual(fromForm, cookieVal);
  if (req) {
    const header = req.headers.get(CSRF_HEADER);
    if (!header) return false;
    return safeEqual(header, cookieVal);
  }
  return false;
}

export class CsrfError extends Error {
  constructor() {
    super("CSRF");
    this.name = "CsrfError";
  }
}

export async function requireCsrf(formData: FormData): Promise<void> {
  if (!(await verifyCsrf(undefined, formData))) throw new CsrfError();
}

/**
 * Double-submit check for arg-style (non-form) server actions: the client
 * passes the JS-readable csrf cookie value as an argument.
 */
export async function verifyCsrfToken(token: string | null | undefined): Promise<boolean> {
  const jar = await cookies();
  const cookieVal = jar.get(CSRF_COOKIE)?.value;
  if (!cookieVal || !token) return false;
  return safeEqual(token, cookieVal);
}

export class CsrfTokenError extends CsrfError {}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashWithPepper(token) } });
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}
