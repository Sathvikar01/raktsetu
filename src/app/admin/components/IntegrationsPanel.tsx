"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Card, CardBody, CardHeader, Table, TBody, TD, TH, THead, TR } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { revokeIntegrationCredentialAction, rotateIntegrationCredentialAction } from "../actions";
import { readCsrfCookie } from "@/components/site/Csrf";
import { DestructiveAction } from "./DestructiveAction";
import type { IntegrationView, SecretOnceView } from "../types";

/**
 * Integrations + credentials table. Plaintext secrets appear exactly once —
 * in the shown-once banner immediately after create/rotate — and are never
 * rendered anywhere else (server data contains no plaintext).
 */
export function IntegrationsPanel({
  organizationId,
  integrations,
  canWrite,
}: {
  organizationId: string;
  integrations: IntegrationView[];
  canWrite: boolean;
}) {
  const d = getDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [secretOnce, setSecretOnce] = useState<SecretOnceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; message: string; secretOnce?: SecretOnceView }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setError(null);
        setSecretOnce(r.secretOnce ?? null);
        setCopied(false);
        router.refresh();
      } else {
        setError(r.message);
      }
    });
  }

  async function copySecret() {
    if (!secretOnce) return;
    try {
      await navigator.clipboard.writeText(secretOnce.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const statusBadge = (status: string) =>
    status === "ACTIVE" ? (
      <Badge tone="teal">{d.admin.credentialACTIVE}</Badge>
    ) : (
      <Badge tone="neutral">{d.admin.credentialREVOKED}</Badge>
    );

  return (
    <div className="space-y-4">
      {/* Shown-once secret response (create/rotate). Never rendered from server data. */}
      {secretOnce ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-amber-600/30 bg-amber-50 px-4 py-4">
          <p className="font-semibold text-amber-900">{d.admin.rotateDoneTitle}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
            <span className="font-medium">{d.admin.colKeyId}:</span>
            <code className="rounded bg-white px-2 py-0.5 font-mono ring-1 ring-amber-600/25">
              {secretOnce.keyId}
            </code>
            {secretOnce.previousKeyId ? (
              <>
                <span className="font-medium">{d.admin.previousKeyIdLabel}:</span>
                <code className="rounded bg-white px-2 py-0.5 font-mono ring-1 ring-ink/15">
                  {secretOnce.previousKeyId}
                </code>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full break-all rounded bg-white px-2 py-1 font-mono text-sm font-bold ring-1 ring-amber-600/25">
              {secretOnce.secret}
            </code>
            <button
              type="button"
              onClick={copySecret}
              disabled={pending}
              className="rounded-lg border border-amber-600/40 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              {copied ? d.staff.copied : d.staff.copyCode}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-amber-900">{d.admin.secretShownOnceWarning}</p>
          <button
            type="button"
            onClick={() => setSecretOnce(null)}
            className="text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
          >
            {d.common.cancel}
          </button>
        </div>
      ) : null}

      {error ? (
        <div role="alert">
          <Alert type="error">{error}</Alert>
        </div>
      ) : null}

      {integrations.length === 0 ? (
        <p className="text-sm text-ink-soft">{d.admin.noIntegrations}</p>
      ) : (
        <div className="space-y-6">
          {integrations.map((integration) => (
            <Card key={integration.id}>
              <CardHeader>
                <h3 className="text-base font-semibold text-ink">
                  {integration.name}{" "}
                  <span className="ml-1 text-sm font-normal text-ink-faint">{integration.adapterType}</span>{" "}
                  {integration.status !== "ACTIVE" ? <Badge tone="amber">{integration.status}</Badge> : null}
                </h3>
                {integration.description ? (
                  <p className="mt-1 text-sm text-ink-soft">{integration.description}</p>
                ) : null}
              </CardHeader>
              <CardBody>
                <Table caption={`${integration.name} — ${d.staff.integrationStatus}`}>
                  <THead>
                    <TR>
                      <TH>{d.admin.colKeyId}</TH>
                      <TH>{d.admin.colCredentialStatus}</TH>
                      <TH>{d.admin.colRotatedAt}</TH>
                      <TH>{d.admin.colLastUsedAt}</TH>
                      {canWrite ? <TH>{d.common.status}</TH> : null}
                    </TR>
                  </THead>
                  <TBody>
                    {integration.credentials.length === 0 ? (
                      <TR>
                        <TD>{d.admin.neverUsed}</TD>
                      </TR>
                    ) : (
                      integration.credentials.map((cred) => (
                        <TR key={cred.id}>
                          <TD>
                            <code className="font-mono text-xs">{cred.keyId}</code>
                          </TD>
                          <TD>{statusBadge(cred.status)}</TD>
                          <TD>{cred.rotatedAtLabel ?? "—"}</TD>
                          <TD>{cred.lastUsedAtLabel ?? d.admin.neverUsed}</TD>
                          {canWrite ? (
                            <TD>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={pending || cred.status !== "ACTIVE"}
                                  onClick={() =>
                                    run(() =>
                                      rotateIntegrationCredentialAction(organizationId, cred.id, readCsrfCookie())
                                    )
                                  }
                                  className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50 disabled:pointer-events-none disabled:opacity-50"
                                >
                                  {d.admin.rotate}
                                </button>
                                <DestructiveAction
                                  label={d.admin.revoke}
                                  confirmLabel={d.admin.revokeConfirmLabel}
                                  cancelLabel={d.common.cancel}
                                  reasonLabel={d.admin.revokeReasonLabel}
                                  reasonPlaceholder={d.admin.revokeReasonPlaceholder}
                                  warning={d.admin.revokeWarning}
                                  disabled={pending || cred.status !== "ACTIVE"}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-crimson-600/30 bg-white px-3 py-1.5 text-sm font-medium text-crimson-700 transition-colors hover:border-crimson-600/60 hover:bg-crimson-50 disabled:pointer-events-none disabled:opacity-50"
                                  runAction={(reason) =>
                                    revokeIntegrationCredentialAction(
                                      organizationId,
                                      cred.id,
                                      reason,
                                      readCsrfCookie()
                                    ).then(() => undefined)
                                  }
                                />
                              </div>
                            </TD>
                          ) : null}
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
