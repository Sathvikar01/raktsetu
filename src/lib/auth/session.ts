import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/packages/database/client";
import { env } from "@/lib/env";
import { randomToken, hashWithPepper, safeEqual } from "@/lib/crypto";

export const SESSION_COOKIE = "rs_session";
export const CSRF_COOKIE = "rs_csrf";
export const CSRF_HEADER = "x-csrf-token";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: "DONOR" | "ORG_STAFF" | "ORG_ADMIN" | "PLATFORM_ADMIN";
  donorProfileId: string | null;
}

export async function createSession(userId: string): Promise<{ token: string; csrf: string }> {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);
  await prisma.session.create({
    data: { userId, tokenHash: hashWithPepper(token), expiresAt },
  });
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

/** Double-submit CSRF check for mutating requests authenticated by cookie. */
export async function verifyCsrf(req: Request): Promise<boolean> {
  const header = req.headers.get(CSRF_HEADER);
  if (!header) return false;
  const jar = await cookies();
  const cookieVal = jar.get(CSRF_COOKIE)?.value;
  if (!cookieVal) return false;
  return safeEqual(header, cookieVal);
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashWithPepper(token) } });
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}
