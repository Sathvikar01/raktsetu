import { NextResponse, type NextRequest } from "next/server";

/**
 * Coarse route gating only (cookie presence). Real authorization is enforced
 * server-side in layouts/actions via requireRole/requireOrgMember — this
 * middleware must never be the sole security boundary.
 */
const PROTECTED_PREFIXES: Array<{ prefix: string; cookie: string; login: string }> = [
  { prefix: "/dashboard", cookie: "rs_session", login: "/login" },
  { prefix: "/donations", cookie: "rs_session", login: "/login" },
  { prefix: "/impact", cookie: "rs_session", login: "/login" },
  { prefix: "/notifications", cookie: "rs_session", login: "/login" },
  { prefix: "/settings", cookie: "rs_session", login: "/login" },
  { prefix: "/staff", cookie: "rs_session", login: "/staff/login" },
  { prefix: "/admin", cookie: "rs_session", login: "/admin/login" },
];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const rule = PROTECTED_PREFIXES.find(
    (r) => path === r.prefix || path.startsWith(r.prefix + "/")
  );
  if (rule && !req.cookies.get(rule.cookie)) {
    const url = new URL(rule.login, req.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/donations/:path*", "/impact/:path*", "/notifications/:path*", "/settings/:path*", "/staff/:path*", "/admin/:path*"],
};
