/**
 * Same-origin relative path for post-login redirects.
 * Rejects protocol-relative URLs, backslashes, and non-path values.
 */
export function safeNextPath(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("://")) {
    return fallback;
  }
  return path;
}

export function destinationForRole(role: string, next?: unknown): string {
  const fallback =
    role === "ORG_STAFF" || role === "ORG_ADMIN"
      ? "/staff"
      : role === "PLATFORM_ADMIN"
        ? "/admin"
        : "/dashboard";
  const path = safeNextPath(next, fallback);
  if (role === "DONOR" && (path === "/dashboard" || path.startsWith("/dashboard/"))) return path;
  if (
    (role === "ORG_STAFF" || role === "ORG_ADMIN" || role === "PLATFORM_ADMIN") &&
    (path === "/staff" ||
      path.startsWith("/staff/") ||
      path === "/admin" ||
      path.startsWith("/admin/"))
  ) {
    return path;
  }
  return fallback;
}

export function mfaLoginPath(): string {
  return "/partner/login";
}
