/**
 * SMS adapter point (mirrors the notification service's channel-adapter
 * pattern, spec §18). The platform core never fabricates a "sent" state:
 * without a configured adapter, delivery degrades to a console log in
 * development and a no-op that callers record as a channel miss.
 *
 * Production deployments register a provider adapter via setSmsSender()
 * during boot (e.g. a Twilio/Gupshup bridge) — the OTP and emergency-alert
 * call sites stay untouched.
 */
import "server-only";
import { env } from "@/lib/env";

export interface SmsSender {
  /** Must throw on failure; returns nothing. `to` is E.164. */
  send(toE164: string, text: string): Promise<void>;
}

let adapter: SmsSender | null = null;

export function setSmsSender(sender: SmsSender): void {
  adapter = sender;
}

/** True when a real provider adapter is registered. */
export function smsConfigured(): boolean {
  return adapter !== null;
}

export async function sendSms(toE164: string, text: string): Promise<boolean> {
  if (adapter) {
    try {
      await adapter.send(toE164, text);
      return true;
    } catch (err) {
      console.error(
        JSON.stringify({ level: "error", msg: "sms_send_failed", to: maskForLog(toE164) })
      );
      console.error(err instanceof Error ? err.message : err);
      return false;
    }
  }
  if (!env.isProd) {
    // Dev/demo fallback: visible, obviously synthetic, never faked as sent.
    console.log(`[sms:console] to ${maskForLog(toE164)}: ${text}`);
  }
  return false;
}

/** PII hygiene: logs carry only the masked tail of a phone number. */
function maskForLog(e164: string): string {
  return e164.length <= 4 ? "••••" : `•••••${e164.slice(-4)}`;
}
