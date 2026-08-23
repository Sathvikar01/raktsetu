import "server-only";
import { prisma } from "@/packages/database/client";
import { toJson } from "@/lib/json";

export interface AuditEntry {
  actorType: "USER" | "INTEGRATION" | "SYSTEM";
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  orgId?: string | null;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit trail. Callers pass already-sanitized metadata.
 * Audit failures are logged but never block the primary operation silently —
 * they surface via onAuditError for monitoring hooks.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        orgId: entry.orgId ?? null,
        ipHash: entry.ipHash ?? null,
        metadataJson: toJson(entry.metadata ?? null),
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "audit_write_failed", action: entry.action }));
    console.error(err instanceof Error ? err.message : err);
  }
}
