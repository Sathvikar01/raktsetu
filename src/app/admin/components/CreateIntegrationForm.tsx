"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Alert, Card, CardBody, CardHeader, Input, Label, Select } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { createIntegrationAction } from "../actions";
import { ADAPTER_TYPES, type AdminActionState } from "../types";

export function CreateIntegrationForm({ organizationId }: { organizationId: string }) {
  const d = getDictionary();
  const router = useRouter();
  const [state, formAction] = useActionState<AdminActionState | null, FormData>(createIntegrationAction, null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  async function copySecret() {
    if (!state?.secretOnce) return;
    try {
      await navigator.clipboard.writeText(state.secretOnce.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const adapterOptions = ADAPTER_TYPES.map((t) => ({
    value: t,
    label: d.admin[`adapter${t}` as keyof typeof d.admin] ?? t,
  }));

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-ink">{d.admin.createIntegrationTitle}</h3>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="int-name">{d.admin.labelIntegrationName}</Label>
              <Input id="int-name" name="name" required maxLength={80} />
            </div>
            <div>
              <Label htmlFor="int-adapter">{d.admin.labelAdapterType}</Label>
              <Select id="int-adapter" name="adapterType" required defaultValue="">
                <option value="" disabled>
                  â€¦
                </option>
                {adapterOptions.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="int-description">{d.admin.labelDescription}</Label>
            <Input id="int-description" name="description" maxLength={200} />
          </div>

          {state && !state.ok ? (
            <div role="alert">
              <Alert type="error">{state.message}</Alert>
            </div>
          ) : null}

          {/* Shown-once credential response */}
          {state?.ok && state.secretOnce ? (
            <div role="alert" className="space-y-3 rounded-xl2 border border-amber-600/30 bg-amber-50 px-4 py-4">
              <p className="font-semibold text-amber-900">{d.admin.integrationCreatedTitle}</p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
                <span className="font-medium">{d.admin.colKeyId}:</span>
                <code className="rounded bg-white px-2 py-0.5 font-mono ring-1 ring-amber-600/25">
                  {state.secretOnce.keyId}
                </code>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full break-all rounded bg-white px-2 py-1 font-mono text-sm font-bold ring-1 ring-amber-600/25">
                  {state.secretOnce.secret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="rounded-lg border border-amber-600/40 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                >
                  {copied ? d.staff.copied : d.staff.copyCode}
                </button>
              </div>
              <p className="text-xs leading-relaxed text-amber-900">{d.admin.secretShownOnceWarning}</p>
            </div>
          ) : null}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.admin.createIntegrationSubmit}
          </button>
        </form>
      </CardBody>
    </Card>
  );
}

