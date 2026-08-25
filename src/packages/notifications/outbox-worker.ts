import "server-only";
/**
 * Outbox email worker — drains QUEUED rows through the configured EmailSender.
 * Bounded retries without schema changes: a row still QUEUED after
 * OUTBOX_MAX_AGE_HOURS is marked FAILED instead of retried forever.
 */
import { prisma } from "@/packages/database/client";
import { recordAudit } from "@/lib/audit";
import { resolveEmailSender } from "./email-sender";

const BATCH_LIMIT = 20;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

export interface OutboxRunSummary {
  processed: number;
  sent: number;
  failed: number;
  skippedExpired: number;
}

/**
 * Auth-critical mail (verification, password reset) must reach the user NOW —
 * it is delivered inline at enqueue time. The row still lands in the outbox
 * first, so a failed inline attempt stays QUEUED and the worker (cron /
 * outbox:process) acts purely as retry/recovery.
 */
export async function enqueueEmailWithImmediateDelivery(input: {
  toEmail: string;
  subject: string;
  bodyText: string;
}): Promise<void> {
  const row = await prisma.outboxEmail.create({
    data: {
      toEmail: input.toEmail,
      subject: input.subject,
      bodyText: input.bodyText,
      status: "QUEUED",
    },
  });

  const sender = resolveEmailSender();
  const result = await sender.send({
    to: input.toEmail,
    subject: input.subject,
    text: input.bodyText,
  });
  if (result.ok) {
    await prisma.outboxEmail.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date() },
    });
    return;
  }
  // Leave QUEUED — the outbox worker retries on its next run.
  console.error(
    JSON.stringify({ level: "error", msg: "outbox_inline_send_failed", reason: result.error })
  );
}

export async function processOutbox(limit = BATCH_LIMIT): Promise<OutboxRunSummary> {
  const summary: OutboxRunSummary = { processed: 0, sent: 0, failed: 0, skippedExpired: 0 };
  const sender = resolveEmailSender();
  const now = Date.now();

  const queued = await prisma.outboxEmail.findMany({
    where: { status: "QUEUED" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  for (const row of queued) {
    if (now - row.createdAt.getTime() > MAX_AGE_MS) {
      await prisma.outboxEmail.update({
        where: { id: row.id },
        data: { status: "FAILED" },
      });
      console.error(
        JSON.stringify({ level: "error", msg: "outbox_expired", provider: sender.provider })
      );
      summary.skippedExpired += 1;
      summary.processed += 1;
      continue;
    }

    const result = await sender.send({ to: row.toEmail, subject: row.subject, text: row.bodyText });
    if (result.ok) {
      await prisma.outboxEmail.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      summary.sent += 1;
    } else {
      // Leave QUEUED for retry on the next run; log short reason only.
      console.error(
        JSON.stringify({ level: "error", msg: "outbox_send_failed", reason: result.error })
      );
      summary.failed += 1;
    }
    summary.processed += 1;
  }

  if (summary.processed > 0) {
    await recordAudit({
      actorType: "SYSTEM",
      action: "outbox.processed",
      resourceType: "OutboxEmail",
      metadata: {
        processed: summary.processed,
        sent: summary.sent,
        failed: summary.failed,
        expired: summary.skippedExpired,
      },
    });
  }

  return summary;
}
