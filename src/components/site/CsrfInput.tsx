import { cookies } from "next/headers";
import { CSRF_COOKIE, CSRF_FIELD } from "@/lib/auth/csrf-cookie";

/**
 * Server-rendered hidden CSRF token for inline <form action={serverAction}>
 * forms in server components. Client-component forms use <CsrfField/> from
 * CsrfProvider instead. No token (e.g. pre-login) renders nothing — the
 * paired action guard decides whether that is acceptable.
 */
export async function CsrfInput(): Promise<React.ReactElement | null> {
  const token = (await cookies()).get(CSRF_COOKIE)?.value;
  if (!token) return null;
  return <input type="hidden" name={CSRF_FIELD} value={token} />;
}
