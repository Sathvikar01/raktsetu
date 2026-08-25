import "server-only";
/**
 * Email delivery adapters for the OutboxEmail queue.
 * The worker never imports a provider SDK — Resend is called over plain fetch,
 * keeping the dependency tree clean. Console sender preserves zero-config dev
 * and self-hosted behaviour.
 */
import { env } from "@/lib/env";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export interface EmailSender {
  readonly provider: string;
  send(email: OutboundEmail): Promise<SendResult>;
}

export class ConsoleEmailSender implements EmailSender {
  readonly provider = "console";

  async send(email: OutboundEmail): Promise<SendResult> {
    // Structured log instead of real delivery (dev/self-host default).
    console.log(
      JSON.stringify({
        level: "info",
        msg: "email_console_delivery",
        to: email.to,
        subject: email.subject,
      })
    );
    return { ok: true };
  }
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 10_000;

export class ResendEmailSender implements EmailSender {
  readonly provider = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(email: OutboundEmail): Promise<SendResult> {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
        }),
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
      if (res.ok) return { ok: true };
      // Never log recipient address or content on failure paths.
      return { ok: false, error: `resend_http_${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.name : "resend_unknown_error" };
    }
  }
}

/** Resolve the active sender from env. Resend requires key + from address. */
export function resolveEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (env.EMAIL_PROVIDER === "resend" && apiKey && from) {
    return new ResendEmailSender(apiKey, from);
  }
  return new ConsoleEmailSender();
}
