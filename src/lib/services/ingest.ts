import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/packages/database/client";
import type { InboundEvent } from "@/packages/schemas/ingestion";
import type { EventType, VerificationStatus } from "@/packages/schemas/events";
import { decideDisclosure, sanitizeRecipientContext } from "@/packages/privacy/engine";
import { dispatchDonorNotification } from "@/packages/notifications/service";
import { recordAudit } from "@/lib/audit";
import { sanitizeMetadata } from "@/lib/json";
import type { ComponentState } from "@/packages/domain/derive";

/**
 * THE single ingestion path. HTTP integrations (POST /api/v1/events), staff
 * simulator actions and demo seeds all call ingestEvent() — demo data flows
 * through identical domain logic as production events (spec §49).
 * Pipeline: idempotency -> identifier resolution -> tenant authz -> append-only
 * write -> derived state refresh -> privacy decision -> notifications -> audit.
 */

export interface IngestContext {
  organizationId: string;
  sourceSystem: string;
  integrationId?: string | null;
  ingestedByUserId?: string | null;
  /** Partner organization kind, drives authorization semantics. */
  orgKind: string; // BLOOD_BANK | HOSPITAL | BLOOD_BANK_AND_HOSPITAL
}

export interface IngestResult {
  status: "ACCEPTED" | "DUPLICATE";
  lifecycleEventId: string;
  duplicateOf?: string;
  disclosureGrantedLevel?: string | null;
  notificationCreated?: boolean;
}

export class IngestAuthzError extends Error {
  constructor(msg = "Partner not authorized for this identifier") {
    super(msg);
    this.name = "IngestAuthzError";
  }
}
export class UnresolvableIdentifierError extends Error {
  constructor(msg = "Identifier does not resolve") {
    super(msg);
    this.name = "UnresolvableIdentifierError";
  }
}

const DAY_MS = 86_400_000;

export async function ingestEvent(event: InboundEvent, ctx: IngestContext): Promise<IngestResult> {
  // ---- 1. Idempotency (PI-7): same (sourceSystem, sourceEventId) is a no-op.
  const existing = await prisma.lifecycleEvent.findUnique({
    where: { sourceSystem_sourceEventId: { sourceSystem: ctx.sourceSystem, sourceEventId: event.external_event_id } },
    select: { id: true },
  });
  if (existing) {
    return { status: "DUPLICATE", lifecycleEventId: existing.id, duplicateOf: existing.id };
  }

  // ---- 3. Corrections reference an existing event from the SAME source system.
  // That (sourceSystem, sourceEventId) match is also the tenant check: a
  // partner may only correct facts it originally produced.
  let correctionForEventId: string | null = null;
  let correctionTarget: { id: string; donationId: string | null; componentId: string | null } | null = null;
  if (event.correction_of_source_event_id) {
    const target = await prisma.lifecycleEvent.findFirst({
      where: { sourceSystem: ctx.sourceSystem, sourceEventId: event.correction_of_source_event_id },
      select: { id: true, donationId: true, componentId: true },
    });
    if (!target) throw new UnresolvableIdentifierError("correction target not found");
    correctionForEventId = target.id;
    correctionTarget = target;
  }

  // ---- 4. Destination facility resolution for transfers (fail-safe to PENDING).
  const meta = sanitizeMetadata(event.metadata ?? {});
  let facilityId: string | null = null;
  let verificationStatus: "VERIFIED" | "PENDING" = event.verification_status === "PENDING" ? "PENDING" : "VERIFIED";
  const destCode = (meta["destination_facility_code"] as string | undefined) ?? null;
  if (destCode && event.event_type !== "EVENT_CORRECTION") {
    const dests = await prisma.facility.findMany({
      where: { externalCode: destCode, organization: { status: "ACTIVE" } },
      select: { id: true, organizationId: true },
      take: 2,
    });
    if (dests.length === 1) {
      meta["destination_facility_id"] = dests[0].id;
      meta["destination_org_id"] = dests[0].organizationId;
    } else {
      // Ambiguous/unknown destination — do not guess (AT-13). Store pending.
      verificationStatus = "PENDING";
      meta["resolution"] = "DESTINATION_FACILITY_UNRESOLVED";
    }
  }
  if (event.facility_code && !destCode) {
    const f = await prisma.facility.findFirst({
      where: { organizationId: ctx.organizationId, code: event.facility_code },
      select: { id: true },
    });
    facilityId = f?.id ?? null;
  }

  // ---- 4b. Resolve target with tenant scoping (PI-9).
  const occurredAt = new Date(event.occurred_at);
  let donationId: string | null = null;
  let componentId: string | null = null;
  let donorUserId: string | null = null;

  if (event.event_type === "EVENT_CORRECTION") {
    // A correction attaches to whatever the corrected fact attached to — the
    // same-sourceSystem target match above is the authorization. (Routing
    // corrections through ordinary identifier resolution would trap hospital
    // corrections behind the foreign-donation tenant rule.)
    if (!correctionTarget) throw new UnresolvableIdentifierError("correction target not found");
    donationId = correctionTarget.donationId;
    componentId = correctionTarget.componentId;
  } else if (event.event_type.startsWith("COMPONENT_")) {
    const component = await resolveComponentForPartner(
      event.component_identifier ?? null,
      event.identifier_scheme,
      event.donation_identifier ?? null,
      event.facility_code ?? null,
      ctx
    );
    componentId = component.id;
    donationId = component.donationId;
    donorUserId = component.donorUserId;
  } else {
    const donation = await resolveDonationForPartner(
      event.donation_identifier ?? null,
      event.identifier_scheme,
      ctx
    );
    donationId = donation.id;
    donorUserId = donation.donorUserId;
  }

  if (!donorUserId) {
    donorUserId = donationId
      ? (
          await prisma.donation.findUnique({
            where: { id: donationId },
            select: { donorProfile: { select: { userId: true } } },
          })
        )?.donorProfile?.userId ?? null
      : null;
  }

  // ---- 5. Append-only write (race-safe idempotency).
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const row = await tx.lifecycleEvent.create({
        data: {
          donationId,
          componentId,
          eventType: event.event_type,
          organizationId: ctx.organizationId,
          facilityId,
          occurredAt,
          sourceSystem: ctx.sourceSystem,
          sourceEventId: event.external_event_id,
          verificationStatus,
          payloadJson: Object.keys(meta).length ? JSON.stringify(meta) : null,
          correctionForEventId,
          integrationId: ctx.integrationId ?? null,
          ingestedByUserId: ctx.ingestedByUserId ?? null,
        },
      });
      // A correction supersedes its target everywhere donor-facing; both rows
      // remain queryable for audit (integration-guide.md).
      if (correctionForEventId) {
        await tx.lifecycleEvent.update({
          where: { id: correctionForEventId },
          data: { supersededByCorrection: true },
        });
      }
      return row;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const dup = await prisma.lifecycleEvent.findUnique({
        where: { sourceSystem_sourceEventId: { sourceSystem: ctx.sourceSystem, sourceEventId: event.external_event_id } },
        select: { id: true },
      });
      return { status: "DUPLICATE", lifecycleEventId: dup?.id ?? "", duplicateOf: dup?.id };
    }
    throw err;
  }

  // ---- 6. Refresh derived state cache (events remain the truth).
  if (componentId) await recomputeDerivedComponentState(componentId);

  // ---- 7. Recipient context + consent + privacy decision (transfusions only).
  let grantedLevel: string | null = null;
  let notificationCreated = false;
  if (
    event.event_type === "COMPONENT_TRANSFUSED" &&
    verificationStatus !== "VERIFIED"
  ) {
    // PI-6: pending facts drive nothing. A PENDING transfusion must never
    // produce a disclosure decision or a donor notification — it renders as
    // awaiting verification until a verified replacement event arrives.
    await recordAudit({
      actorType: "SYSTEM", action: "disclosure.skipped_unverified", resourceType: "LifecycleEvent",
      resourceId: created.id, orgId: ctx.organizationId,
      metadata: { eventType: event.event_type, verificationStatus },
    });
  } else if (event.event_type === "COMPONENT_TRANSFUSED" && event.disclosure) {
    const outcome = await recordRecipientContextAndDecide(
      created.id,
      componentId!,
      event.disclosure,
      donorUserId,
      ctx.organizationId,
      { relatedDonationId: donationId, relatedComponentId: componentId }
    );
    grantedLevel = outcome.grantedLevel;
    notificationCreated = outcome.notified;
  } else if (event.event_type === "COMPONENT_TRANSFUSED" && donorUserId) {
    // Verified transfusion always notifies (generic LEVEL-0 message).
    await dispatchDonorNotification({
      userId: donorUserId,
      typeKey: "notify.component.transfused",
      genericTitle: true,
      titleKey: "notify.genericUpdateTitle",
      bodyKey: "privacy.transfusedGeneric",
      relatedDonationId: donationId,
      relatedComponentId: componentId,
    });
    notificationCreated = true;
    await recordAudit({
      actorType: "SYSTEM", action: "disclosure.generated", resourceType: "LifecycleEvent",
      resourceId: created.id, orgId: ctx.organizationId,
      metadata: { grantedLevel: "NONE" },
    });
  }

  // ---- 8. Lifecycle milestone notifications.
  if (donorUserId) {
    if (
      event.event_type === "COMPONENT_CREATED" &&
      !(await prisma.notification.findFirst({ where: { userId: donorUserId, typeKey: "notify.component.prepared", relatedDonationId: donationId } }))
    ) {
      const count = await prisma.bloodComponent.count({ where: { donationId: donationId! } });
      const pref = await prisma.notificationPreference.findUnique({ where: { userId: donorUserId } });
      const descriptive = pref?.descriptiveContent ?? false;
      await dispatchDonorNotification({
        userId: donorUserId,
        typeKey: "notify.component.prepared",
        genericTitle: true,
        titleKey: "notify.genericUpdateTitle",
        bodyKey: descriptive ? "donor.componentsPrepared" : "notify.genericUpdateBody",
        bodyParams: { count },
        relatedDonationId: donationId,
        relatedComponentId: componentId,
      });
    }
    if (["COMPONENT_EXPIRED", "COMPONENT_DISCARDED", "COMPONENT_RECALLED"].includes(event.event_type)) {
      await dispatchDonorNotification({
        userId: donorUserId,
        typeKey: "notify.component.completed",
        genericTitle: true,
        titleKey: "notify.genericUpdateTitle",
        bodyKey: "privacy.lifecycleComplete",
        relatedDonationId: donationId,
        relatedComponentId: componentId,
      });
    }
  }

  await recordAudit({
    actorType: ctx.integrationId ? "INTEGRATION" : "USER",
    actorId: ctx.integrationId ?? ctx.ingestedByUserId ?? null,
    action: "event.ingested",
    resourceType: "LifecycleEvent",
    resourceId: created.id,
    orgId: ctx.organizationId,
    metadata: { eventType: event.event_type, sourceEventId: event.external_event_id, verificationStatus },
  });

  return {
    status: "ACCEPTED",
    lifecycleEventId: created.id,
    disclosureGrantedLevel: grantedLevel,
    notificationCreated,
  };
}

// ---------------------------------------------------------------------------
// Identifier resolution with deny-by-default tenant checks
// ---------------------------------------------------------------------------

async function resolveDonationForPartner(
  identifier: string | null,
  scheme: string,
  ctx: IngestContext
): Promise<{ id: string; donorUserId: string | null }> {
  if (!identifier) throw new UnresolvableIdentifierError("donation_identifier required");
  let donation = null as
    | { id: string; organizationId: string; donorProfileId: string | null }
    | null;

  if (scheme === "INTERNAL_UUID") {
    donation = await prisma.donation.findUnique({
      where: { id: identifier },
      select: { id: true, organizationId: true, donorProfileId: true },
    });
  } else if (scheme === "ISBT128_DIN") {
    donation = await prisma.donation.findFirst({
      where: { din: identifier },
      select: { id: true, organizationId: true, donorProfileId: true },
    });
  } else {
    const ext = await prisma.externalIdentifier.findUnique({
      where: { scheme_value: { scheme, value: identifier } },
    });
    if (ext && ext.entityType === "DONATION") {
      donation = await prisma.donation.findUnique({
        where: { id: ext.entityId },
        select: { id: true, organizationId: true, donorProfileId: true },
      });
    }
    if (!donation && scheme !== "HOSPITAL_LOCAL") {
      donation = await prisma.donation.findUnique({
        where: { organizationId_externalDonationId: { organizationId: ctx.organizationId, externalDonationId: identifier } },
        select: { id: true, organizationId: true, donorProfileId: true },
      });
    }
  }

  if (!donation) throw new UnresolvableIdentifierError(`donation ${identifier}`);
  assertOrgCanAccessDonation(donation.organizationId, ctx);
  const donorUserId = donation.donorProfileId
    ? (
        await prisma.donorProfile.findUnique({
          where: { id: donation.donorProfileId },
          select: { userId: true },
        })
      )?.userId ?? null
    : null;
  return { id: donation.id, donorUserId };
}

async function resolveComponentForPartner(
  identifier: string | null,
  scheme: string,
  donationIdentifier: string | null,
  facilityCode: string | null,
  ctx: IngestContext
): Promise<{ id: string; donationId: string; donorUserId: string | null }> {
  if (!identifier && !donationIdentifier) throw new UnresolvableIdentifierError("no resolvable identifier");

  let component: { id: string; donationId: string; donationOrganizationId: string; donorProfileId: string | null } | null = null;

  if (identifier) {
    if (scheme === "INTERNAL_UUID" || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
      const c = await prisma.bloodComponent.findUnique({
        where: { id: identifier },
        include: { donation: { select: { organizationId: true, donorProfileId: true } } },
      });
      if (c) {
        component = { id: c.id, donationId: c.donationId, donationOrganizationId: c.donation.organizationId, donorProfileId: c.donation.donorProfileId };
      }
    } else {
      const ext = await prisma.externalIdentifier.findUnique({
        where: { scheme_value: { scheme, value: identifier } },
      });
      if (ext && ext.entityType === "COMPONENT") {
        const c = await prisma.bloodComponent.findUnique({
          where: { id: ext.entityId },
          include: { donation: { select: { organizationId: true, donorProfileId: true } } },
        });
        if (c) component = { id: c.id, donationId: c.donationId, donationOrganizationId: c.donation.organizationId, donorProfileId: c.donation.donorProfileId };
      }
      if (!component) {
        const c = await prisma.bloodComponent.findFirst({
          where: { externalComponentId: identifier },
          include: { donation: { select: { organizationId: true, donorProfileId: true } } },
          take: 2,
        });
        if (c && (await prisma.bloodComponent.count({ where: { externalComponentId: identifier } })) === 1) {
          component = { id: c.id, donationId: c.donationId, donationOrganizationId: c.donation.organizationId, donorProfileId: c.donation.donorProfileId };
        }
      }
    }
  }

  if (!component && donationIdentifier) {
    const donation = await resolveDonationForPartner(donationIdentifier, scheme, ctx);
    // Single-component donations may address their only component via donation ref + type in metadata.
    throw new UnresolvableIdentifierError("component identifier required for component events");
  }
  if (!component) throw new UnresolvableIdentifierError(`component ${identifier}`);

  const partnerOwnsDonation = component.donationOrganizationId === ctx.organizationId;
  if (!partnerOwnsDonation) {
    // Hospital path: authorized iff a VERIFIED transfer named one of our facility codes as destination.
    const authorized = await hospitalAuthorizedForComponent(component.id, ctx.organizationId);
    if (!authorized) throw new IngestAuthzError();
  }
  const donorUserId = component.donorProfileId
    ? (await prisma.donorProfile.findUnique({ where: { id: component.donorProfileId }, select: { userId: true } }))?.userId ?? null
    : null;
  return { id: component.id, donationId: component.donationId, donorUserId };
}

async function hospitalAuthorizedForComponent(componentId: string, orgId: string): Promise<boolean> {
  const transfers = await prisma.lifecycleEvent.findMany({
    where: {
      componentId,
      eventType: "COMPONENT_TRANSFERRED",
      verificationStatus: "VERIFIED",
      supersededByCorrection: false,
    },
    select: { payloadJson: true },
  });
  const myFacilityIds = new Set(
    (
      await prisma.facility.findMany({ where: { organizationId: orgId }, select: { id: true } })
    ).map((f) => f.id)
  );
  return transfers.some((t) => {
    try {
      const p = t.payloadJson ? (JSON.parse(t.payloadJson) as Record<string, unknown>) : {};
      const destFacility = typeof p["destination_facility_id"] === "string" ? p["destination_facility_id"] : null;
      return destFacility ? myFacilityIds.has(destFacility) : false;
    } catch {
      return false;
    }
  });
}

function assertOrgCanAccessDonation(donationOrgId: string, ctx: IngestContext): void {
  const kindsAllowedToActOnForeignDonations = new Set<string>([]); // nobody acts on foreign donations directly
  if (donationOrgId !== ctx.organizationId && !kindsAllowedToActOnForeignDonations.has(ctx.orgKind)) {
    throw new IngestAuthzError();
  }
}

// ---------------------------------------------------------------------------
// Recipient context + privacy decision + provenance
// ---------------------------------------------------------------------------

async function recordRecipientContextAndDecide(
  eventId: string,
  componentId: string,
  disclosure: NonNullable<InboundEvent["disclosure"]>,
  donorUserId: string | null,
  verifyingOrganizationId: string,
  rel: { relatedDonationId: string | null; relatedComponentId: string | null }
): Promise<{ grantedLevel: string | null; notified: boolean }> {
  // Defense in depth for PI-6: the stored fact itself must be VERIFIED before
  // any consent record, recipient context, decision or notification is made.
  const stored = await prisma.lifecycleEvent.findUnique({
    where: { id: eventId },
    select: { verificationStatus: true },
  });
  if (!stored || stored.verificationStatus !== "VERIFIED") {
    await recordAudit({
      actorType: "SYSTEM", action: "disclosure.skipped_unverified", resourceType: "LifecycleEvent",
      resourceId: eventId, orgId: verifyingOrganizationId,
      metadata: { verificationStatus: stored?.verificationStatus ?? "MISSING" },
    });
    return { grantedLevel: null, notified: false };
  }

  const sanitized = sanitizeRecipientContext({
    level: disclosure.level,
    category: disclosure.category,
    ageBand: disclosure.age_band,
  });

  // Consent + context attribution: the ORGANIZATION THAT INGESTED the
  // transfusion (the treating hospital) verifies consent and hosts the
  // context — never the blood bank that merely owns the donation.
  await prisma.disclosureConsent.create({
    data: {
      recipientRef: disclosure.recipient_ref,
      level: disclosure.level,
      category: sanitized.ok ? sanitized.category : null,
      policyVersion: "1.0",
      verifiedByOrgId: verifyingOrganizationId,
    },
  });

  await prisma.recipientContext.upsert({
    where: { recipientRef: disclosure.recipient_ref },
    create: {
      recipientRef: disclosure.recipient_ref,
      componentId,
      eventId,
      facilityOrgId: verifyingOrganizationId,
      ageBand: sanitized.ok ? sanitized.ageBand : null,
      treatmentCategory: sanitized.ok ? sanitized.category : null,
    },
    update: { componentId, eventId, ageBand: sanitized.ok ? sanitized.ageBand : null, treatmentCategory: sanitized.ok ? sanitized.category : null },
  });

  if (!sanitized.ok || disclosure.level === "NONE") {
    await persistDecision(eventId, "NONE", "NONE", "privacy.transfusedGeneric", {}, sanitized.ok ? null : sanitized.reason, verifyingOrganizationId, null);
    return { grantedLevel: "NONE", notified: false };
  }

  // Cohort for re-id floor: same category × ageBand × trailing 30 days.
  const band = disclosure.age_band ?? null;
  const since = new Date(Date.now() - 30 * DAY_MS);
  const cohortSize = await prisma.recipientContext.count({
    where: {
      treatmentCategory: sanitized.category,
      ...(band ? { ageBand: band } : {}),
      createdAt: { gte: since },
    },
  });

  const decision = decideDisclosure({
    eventType: "COMPONENT_TRANSFUSED",
    componentType: (await prisma.bloodComponent.findUnique({ where: { id: componentId }, select: { componentType: true } }))?.componentType ?? null,
    verificationStatus: stored.verificationStatus as VerificationStatus,
    consent: {
      level: disclosure.level,
      category: sanitized.category,
      ageBand: band,
      patientConsentVerified: disclosure.patient_consent_verified === true,
      verifiedAt: new Date(),
      expiresAt: null,
    },
    cohortSize,
  });

  await persistDecision(eventId, disclosure.level, decision.grantedLevel, decision.messageKey, decision.params, decision.degradedReason, verifyingOrganizationId, cohortSize);

  if (donorUserId && decision.messageKey) {
    const pref = await prisma.notificationPreference.findUnique({ where: { userId: donorUserId } });
    const descriptive = pref?.descriptiveContent ?? false;
    await dispatchDonorNotification({
      userId: donorUserId,
      typeKey: "notify.component.transfused.context",
      genericTitle: true,
      titleKey: "notify.genericUpdateTitle",
      bodyKey: descriptive ? decision.messageKey : "notify.genericUpdateBody",
      bodyParams: decision.params,
      relatedDonationId: rel.relatedDonationId,
      relatedComponentId: rel.relatedComponentId,
    });
    return { grantedLevel: decision.grantedLevel, notified: true };
  }
  return { grantedLevel: decision.grantedLevel, notified: false };
}

async function persistDecision(
  eventId: string,
  requestedLevel: string,
  grantedLevel: string,
  messageKey: string | null,
  params: Record<string, string>,
  degradedReason: string | null,
  orgId: string,
  cohortSize: number | null
): Promise<void> {
  const ev = await prisma.lifecycleEvent.findUnique({
    where: { id: eventId },
    select: { sourceSystem: true, sourceEventId: true, organization: { select: { name: true, id: true } } },
  });
  await prisma.disclosureDecision.create({
    data: {
      eventId,
      requestedLevel,
      grantedLevel,
      messageKey: messageKey ?? "",
      paramsJson: JSON.stringify(params),
      degradedReason,
      cohortSize,
      provenanceJson: JSON.stringify({
        chain: ["DisclosureDecision", "LifecycleEvent", "Organization"],
        eventId,
        organizationId: ev?.organization.id ?? orgId,
        organizationName: ev?.organization.name ?? null,
        sourceSystem: ev?.sourceSystem ?? null,
        sourceEventId: ev?.sourceEventId ?? null,
      }),
    },
  });
  await recordAudit({
    actorType: "SYSTEM",
    action: "disclosure.generated",
    resourceType: "DisclosureDecision",
    resourceId: eventId,
    orgId,
    metadata: { requestedLevel, grantedLevel, degradedReason },
  });
}

/** Recompute cached component state; events stay the source of truth. */
export async function recomputeDerivedComponentState(componentId: string): Promise<ComponentState | null> {
  const events = await prisma.lifecycleEvent.findMany({
    where: { componentId },
    orderBy: [{ occurredAt: "asc" }, { receivedAt: "asc" }],
    select: {
      id: true, eventType: true, occurredAt: true, receivedAt: true,
      verificationStatus: true, organizationId: true, facilityId: true,
      sourceSystem: true, sourceEventId: true, correctionForEventId: true, payloadJson: true,
    },
  });
  const { deriveComponentState } = await import("@/packages/domain/derive");
  const result = deriveComponentState(
    events.map((e) => ({
      id: e.id,
      eventType: e.eventType as EventType,
      occurredAt: e.occurredAt,
      receivedAt: e.receivedAt,
      verificationStatus: e.verificationStatus as VerificationStatus,
      organizationId: e.organizationId,
      facilityId: e.facilityId,
      sourceSystem: e.sourceSystem,
      sourceEventId: e.sourceEventId,
      correctionForEventId: e.correctionForEventId,
      payload: {},
    }))
  );
  await prisma.bloodComponent.update({
    where: { id: componentId },
    data: {
      currentDerivedState: result.state ?? "PREPARING",
      locationFacilityId: result.lastFacilityId,
      derivedAt: new Date(),
    },
  });
  return result.state;
}
