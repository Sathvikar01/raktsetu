"use client";

import { useActionState } from "react";
import { Alert, Card, CardBody, CardHeader, Input, Label, Select } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { recordDonationAction } from "../actions";
import type { OpsActionState, OptionItem } from "../types";
import { CopyButton } from "./CopyButton";

function nowLocalValue(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function RecordDonationForm({
  organizationId,
  facilities,
}: {
  organizationId: string;
  facilities: OptionItem[];
}) {
  const d = getDictionary();
  const [state, formAction] = useActionState<OpsActionState | null, FormData>(recordDonationAction, null);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-ink">{d.staff.bbRecordTitle}</h3>
        <p className="mt-1 text-sm text-ink-soft">{d.staff.bbRecordIntro}</p>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="bb-ext-donation-id">{d.staff.labelExternalDonationId}</Label>
              <Input id="bb-ext-donation-id" name="externalDonationId" required maxLength={128} />
            </div>
            <div>
              <Label htmlFor="bb-din">{d.staff.labelDin}</Label>
              <Input id="bb-din" name="din" maxLength={64} />
            </div>
            <div>
              <Label htmlFor="bb-donated-at">{d.staff.labelDonatedAt}</Label>
              <Input
                id="bb-donated-at"
                name="donatedAt"
                type="datetime-local"
                defaultValue={nowLocalValue()}
                required
              />
            </div>
            <div>
              <Label htmlFor="bb-facility">{d.staff.labelFacility}</Label>
              <Select id="bb-facility" name="facilityCode" defaultValue="">
                <option value="">{d.staff.facilityNone}</option>
                {facilities.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {state && !state.ok ? (
            <div role="alert">
              <Alert type="error">{state.message}</Alert>
            </div>
          ) : null}
          {state?.ok && state.linkCode ? (
            <div className="space-y-3 rounded-xl2 border border-teal-600/20 bg-teal-50 px-4 py-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
                {d.staff.linkCodeLabel}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <code className="rounded-lg bg-white px-3 py-1.5 font-mono text-lg font-bold tracking-wider text-ink ring-1 ring-teal-600/30">
                  {state.linkCode}
                </code>
                <CopyButton value={state.linkCode} label={d.staff.copyCode} copiedLabel={d.staff.copied} />
              </div>
              <p className="text-xs leading-relaxed text-teal-800">{d.staff.linkCodeIssued}</p>
            </div>
          ) : null}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.staff.recordDonation}
          </button>
        </form>
      </CardBody>
    </Card>
  );
}
