import { NextResponse } from "next/server";
import { prisma } from "@/packages/database/client";
import { InboundEventSchema } from "@/packages/schemas/ingestion";
import {
  ingestEvent,
  IngestAuthzError,
  UnresolvableIdentifierError,
  type IngestContext,
} from "@/lib/services/ingest";
import { decryptSecret, sha256Hex, verifySignedRequest } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api";

/**
 * Partner integration endpoint (docs/integration-guide.md).
 * HMAC-signed requests over `${timestamp}.${rawBody}`; every accepted,
 * duplicated or rejected attempt is logged as an IntegrationEvent carrying the
 * body hash + a short reason code ONLY — never secrets, never payload content.
 */

const RATE_LIMIT_PER_MIN = 120;
const RATE_WINDOW_MS = 60_000;

type Disposition = "ACCEPTED" | "DUPLICATE" | "INVALID" | "UNAUTHORIZED" | "ERROR";

interface ResolvedCredential {
  integrationId: string;
  /** Null unless credential → integration → organization are all ACTIVE. */
  secret: string | null;
  revoked: boolean;
}

async function resolveCredential(keyId: string | null): Promise<ResolvedCredential | null> {
  if (!keyId) return null;
  const credential = await prisma.integrationCredential.findUnique({
    where: { keyId },
    select: {
      status: true,
      secretEncrypted: true,
      integration: {
        select: {
          id: true,
          orgId: true,
          status: true,
          org: { select: { kind: true, status: true } },
        },
      },
    },
  });
  if (!credential) return null;

  const chainActive =
    credential.status === "ACTIVE" &&
    credential.integration.status === "ACTIVE" &&
    credential.integration.org.status === "ACTIVE";

  const base: ResolvedCredential = {
    integrationId: credential.integration.id,
    secret: null,
    revoked: credential.status === "REVOKED",
  };
  if (!chainActive) return base;

  try {
    return { ...base, secret: decryptSecret(credential.secretEncrypted) };
  } catch {
    return base; // undecryptable (e.g. rotated APP_SECRET) fails closed as unknown key
  }
}

/** Best-effort append-only wire log. Detail carries reason codes only. */
async function logIntegrationEvent(input: {
  integrationId: string;
  bodySha256: string;
  disposition: Disposition;
  errorDetail?: string | null;
  lifecycleEventId?: string | null;
}): Promise<void> {
  try {
    await prisma.integrationEvent.create({
      data: {
        integrationId: input.integrationId,
        direction: "INBOUND",
        bodySha256: input.bodySha256,
        disposition: input.disposition,
        errorDetail: input.errorDetail ?? null,
        lifecycleEventId: input.lifecycleEventId ?? null,
      },
    });
  } catch {
    console.error(JSON.stringify({ level: "error", msg: "integration_event_log_failed" }));
  }
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const bodySha256 = sha256Hex(rawBody);
  const keyId = req.headers.get("x-raktsetu-key");
  const timestamp = req.headers.get("x-raktsetu-timestamp");
  const signature = req.headers.get("x-raktsetu-signature");

  if (keyId) {
    const rl = rateLimit(`api:${keyId}`, RATE_LIMIT_PER_MIN, RATE_WINDOW_MS);
    if (!rl.ok) {
      return apiError("RATE_LIMITED", "Too many requests. Retry later.", 429, {
        retry_after_sec: rl.retryAfterSec,
      });
    }
  }

  const credential = await resolveCredential(keyId);
  const check = verifySignedRequest(
    rawBody,
    { keyId, timestamp, signature },
    () => credential?.secret ?? null
  );

  if (!check.ok) {
    // Revocation is visible internally; the caller always gets one generic 401.
    const reason = credential?.revoked ? "REVOKED_KEY" : (check.reason ?? "MISSING_HEADERS");
    if (credential) {
      await logIntegrationEvent({
        integrationId: credential.integrationId,
        bodySha256,
        disposition: "UNAUTHORIZED",
        errorDetail: reason,
      });
    }
    return apiError("UNAUTHORIZED", "Unauthorized.", 401);
  }

  const integration = await prisma.integration.findUnique({
    where: { id: credential!.integrationId },
    select: { id: true, orgId: true, org: { select: { kind: true } } },
  });
  if (!integration) {
    return apiError("UNAUTHORIZED", "Unauthorized.", 401); // raced away mid-request — fail closed
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    await logIntegrationEvent({
      integrationId: integration.id,
      bodySha256,
      disposition: "INVALID",
      errorDetail: "MALFORMED_JSON",
    });
    return apiError("VALIDATION_ERROR", "Payload failed schema validation.", 422);
  }

  const parsed = InboundEventSchema.safeParse(parsedJson);
  if (!parsed.success) {
    await logIntegrationEvent({
      integrationId: integration.id,
      bodySha256,
      disposition: "INVALID",
      errorDetail: "SCHEMA_VALIDATION",
    });
    return apiError("VALIDATION_ERROR", "Payload failed schema validation.", 422);
  }

  const ctx: IngestContext = {
    organizationId: integration.orgId,
    sourceSystem: `partner-api:${integration.id}`,
    integrationId: integration.id,
    ingestedByUserId: null,
    orgKind: integration.org.kind,
  };

  try {
    const result = await ingestEvent(parsed.data, ctx);
    await logIntegrationEvent({
      integrationId: integration.id,
      bodySha256,
      disposition: result.status,
      lifecycleEventId: result.lifecycleEventId,
    });

    if (result.status === "DUPLICATE") {
      return NextResponse.json(
        { ok: true, status: "duplicate", duplicate_of: result.duplicateOf ?? result.lifecycleEventId },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { ok: true, status: "accepted", event_id: result.lifecycleEventId },
      { status: 202 }
    );
  } catch (err) {
    if (err instanceof UnresolvableIdentifierError || err instanceof IngestAuthzError) {
      await logIntegrationEvent({
        integrationId: integration.id,
        bodySha256,
        disposition: "ERROR",
        errorDetail: err.name,
      });
      return err instanceof UnresolvableIdentifierError
        ? apiError("CONFLICT", "Identifier does not resolve.", 409)
        : apiError("FORBIDDEN", "Forbidden.", 403);
    }
    await logIntegrationEvent({
      integrationId: integration.id,
      bodySha256,
      disposition: "ERROR",
      errorDetail: (err as Error)?.name?.slice(0, 64) ?? "INTERNAL",
    });
    console.error(JSON.stringify({ level: "error", msg: "ingest_failed", name: (err as Error)?.name }));
    return apiError("INTERNAL", "Internal error.", 500);
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } },
    { status: 405, headers: { Allow: "POST" } }
  );
}
