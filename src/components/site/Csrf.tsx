"use client";

import { createContext, useContext } from "react";
import { CSRF_FIELD } from "@/lib/auth/csrf-cookie";

const CsrfContext = createContext("");

export function CsrfProvider({ token, children }: { token: string; children: React.ReactNode }) {
  return <CsrfContext.Provider value={token}>{children}</CsrfContext.Provider>;
}

/** Hidden double-submit token. Must sit inside a mutating form. */
export function CsrfField() {
  const token = useContext(CsrfContext);
  return <input type="hidden" name={CSRF_FIELD} value={token} />;
}

/**
 * Read the JS-readable csrf cookie for arg-style server actions (no form).
 * Pair with verifyCsrfToken() server-side.
 */
export function readCsrfCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)rs_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}
