import "server-only";
import { prisma } from "@/packages/database/client";
import { encryptSecret, randomToken } from "@/lib/crypto";
import { recordAudit } from "@/lib/audit";

/**
 * Integration lifecycle: creation + credential issuing, rotation, revocation.
 * Secrets are AES-256-GCM encrypted at rest; the plaintext secret is returned
 * exactly once at issue/rotation time and never persisted or logged.
 */

export class ProvisioningNotFoundError extends Error {
  constructor(message = "Provisioning target not found") {
    super(message);
    this.name = "ProvisioningNotFoundError";
  }
}

export interface ProvisionedCredential {
  credentialId: string;
  integrationId: string;
  keyId: string;
  /** Plaintext secret — delivered once, never stored in the clear. */
  secret: string;
  scopes: string;
}

export interface CreateIntegrationResult {
  integration: { id: string; orgId: string; name: string; adapterType: string };
  credential: ProvisionedCredential;
}

async function issueCredential(integrationId: string): Promise<ProvisionedCredential> {
  const keyId = `rk_${randomToken(8)}`;
  const secret = randomToken(32);
  const credential = await prisma.integrationCredential.create({
    data: {
      integrationId,
      keyId,
      secretEncrypted: encryptSecret(secret),
      status: "ACTIVE",
    },
  });
  return {
    credentialId: credential.id,
    integrationId,
    keyId,
    secret,
    scopes: credential.scopes,
  };
}

export async function createIntegrationWithCredential(
  orgId: string,
  name: string,
  adapterType: string,
  description?: string | null
): Promise<CreateIntegrationResult> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new ProvisioningNotFoundError("Organization not found");

  const integration = await prisma.integration.create({
    data: {
      orgId,
      name,
      adapterType,
      description: description ?? null,
    },
  });
  const credential = await issueCredential(integration.id);

  await recordAudit({
    actorType: "SYSTEM",
    action: "integration.credential.created",
    resourceType: "IntegrationCredential",
    resourceId: credential.credentialId,
    orgId,
    metadata: { integrationId: integration.id, keyId: credential.keyId, adapterType },
  });

  return {
    integration: {
      id: integration.id,
      orgId: integration.orgId,
      name: integration.name,
      adapterType: integration.adapterType,
    },
    credential,
  };
}

export interface RotatedCredential extends Omit<ProvisionedCredential, "integrationId"> {
  integrationId: string;
  previousKeyId: string;
}

export async function rotateCredential(credentialId: string): Promise<RotatedCredential> {
  const old = await prisma.integrationCredential.findUnique({
    where: { id: credentialId },
    include: { integration: { select: { id: true, orgId: true } } },
  });
  if (!old) throw new ProvisioningNotFoundError("Credential not found");

  const newKeyId = `rk_${randomToken(8)}`;
  const secret = randomToken(32);
  const rotatedAt = new Date();

  const created = await prisma.$transaction(async (tx) => {
    await tx.integrationCredential.update({
      where: { id: old.id },
      data: { status: "REVOKED", rotatedAt },
    });
    return tx.integrationCredential.create({
      data: {
        integrationId: old.integrationId,
        keyId: newKeyId,
        secretEncrypted: encryptSecret(secret),
        scopes: old.scopes,
        status: "ACTIVE",
      },
    });
  });

  await recordAudit({
    actorType: "SYSTEM",
    action: "integration.credential.rotated",
    resourceType: "IntegrationCredential",
    resourceId: created.id,
    orgId: old.integration.orgId,
    metadata: {
      integrationId: old.integrationId,
      previousCredentialId: old.id,
      previousKeyId: old.keyId,
      newKeyId,
    },
  });

  return {
    credentialId: created.id,
    integrationId: old.integrationId,
    keyId: newKeyId,
    secret,
    scopes: created.scopes,
    previousKeyId: old.keyId,
  };
}

export async function revokeCredential(
  credentialId: string,
  reason?: string | null
): Promise<{ keyId: string; status: "REVOKED"; alreadyRevoked: boolean }> {
  const credential = await prisma.integrationCredential.findUnique({
    where: { id: credentialId },
    include: { integration: { select: { orgId: true } } },
  });
  if (!credential) throw new ProvisioningNotFoundError("Credential not found");

  const alreadyRevoked = credential.status === "REVOKED";
  if (!alreadyRevoked) {
    await prisma.integrationCredential.update({
      where: { id: credential.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await recordAudit({
      actorType: "SYSTEM",
      action: "integration.credential.revoked",
      resourceType: "IntegrationCredential",
      resourceId: credential.id,
      orgId: credential.integration.orgId,
      metadata: { keyId: credential.keyId, reason: reason?.slice(0, 120) ?? null },
    });
  }

  return { keyId: credential.keyId, status: "REVOKED", alreadyRevoked };
}
