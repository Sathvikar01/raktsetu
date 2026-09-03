import "server-only";
import { prisma } from "@/packages/database/client";
import { ingestEvent } from "@/lib/services/ingest";
import { recordAudit } from "@/lib/audit";
import type { IngestContext } from "@/lib/services/ingest";

/**
 * Auto-expiry sweep. Components past their computed expiresAt that are still
 * in a live state (PREPARING / AVAILABLE / RESERVED) are expired by emitting a
 * COMPONENT_EXPIRED event through the standard ingest pipeline — events stay
 * the source of truth, and deterministic sourceEventIds make re-runs no-ops.
 * RESERVED units are expired too: an expired unit must never reach a patient.
 */

const BATCH_SIZE = 100;

export interface SweepRunSummary {
  expiredCount: number;
  scannedBatches: number;
}

function orgSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
}

async function contextFor(orgId: string, orgName: string): Promise<IngestContext> {
  return {
    organizationId: orgId,
    sourceSystem: `${orgSlug(orgName)}-ops`,
    orgKind: "BLOOD_BANK",
  };
}

export async function runExpirySweep(now = new Date()): Promise<SweepRunSummary> {
  let expiredCount = 0;
  let scannedBatches = 0;
  const seen = new Set<string>(); // guards the loop: unprocessable rows must not be re-fetched forever

  for (;;) {
    const due = await prisma.bloodComponent.findMany({
      where: {
        expiresAt: { lt: now },
        currentDerivedState: { in: ["PREPARING", "AVAILABLE", "RESERVED"] },
      },
      select: {
        id: true,
        externalComponentId: true,
        donation: { select: { organizationId: true, organization: { select: { name: true } } } },
      },
      take: BATCH_SIZE,
      orderBy: { expiresAt: "asc" },
    });
    const fresh = due.filter((c) => !seen.has(c.id));
    if (fresh.length === 0) break;
    scannedBatches += 1;

    for (const component of fresh) {
      seen.add(component.id);
      if (!component.externalComponentId) continue;
      const ctx = await contextFor(
        component.donation.organizationId,
        component.donation.organization.name
      );
      await ingestEvent(
        {
          external_event_id: `auto-expired:${component.id}`,
          component_identifier: component.externalComponentId,
          identifier_scheme: "FACILITY_BARCODE",
          event_type: "COMPONENT_EXPIRED",
          occurred_at: now.toISOString(),
          verification_status: "VERIFIED",
          metadata: { reason: "AUTO_EXPIRY" },
        },
        ctx
      );
      expiredCount += 1;
    }
  }

  if (expiredCount > 0) {
    await recordAudit({
      actorType: "SYSTEM",
      action: "inventory.expiry_sweep",
      resourceType: "BloodComponent",
      metadata: { expiredCount },
    });
  }
  return { expiredCount, scannedBatches };
}
