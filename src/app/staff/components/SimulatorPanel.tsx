"use client";

import { useState, useTransition } from "react";
import { Check, FlaskConical } from "lucide-react";
import { Alert, Card, CardBody, CardHeader, Input, Label } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import {
  simulateComponentsStep,
  simulateFullJourneyStep,
  simulateProcessingStep,
  simulateReceiveStep,
  simulateRecordDonationStep,
  simulateTransfusionStep,
  simulateTransferStep,
} from "../actions";
import type { OpsActionState } from "../types";
import { CopyButton } from "./CopyButton";

/**
 * Demo-mode simulator. The parent server component only renders this panel
 * when can(role,"simulator:use") AND process.env.DEMO_MODE === "true".
 */
export function SimulatorPanel() {
  const d = getDictionary();
  const [result, setResult] = useState<OpsActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const [donorEmail, setDonorEmail] = useState("");

  // Chained opaque ids from previous steps (internal UUIDs only).
  const [simDonationId, setSimDonationId] = useState<string | undefined>();
  const [simRbcComponentId, setSimRbcComponentId] = useState<string | undefined>();

  function run(fn: () => Promise<OpsActionState>) {
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        if (r.simDonationId) setSimDonationId(r.simDonationId);
        if (r.simRbcComponentId) setSimRbcComponentId(r.simRbcComponentId);
      }
    });
  }

  const steps = result?.steps ?? [];

  return (
    <Card className="border-amber-600/25">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <FlaskConical className="size-5 text-amber-600" aria-hidden />
          {d.staff.simulator}
        </h3>
        <p className="mt-1 text-sm text-ink-soft">
          <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900">
            {d.staff.simSyntheticBadge}
          </span>
          {d.staff.simulatorNote}
        </p>
      </CardHeader>
      <CardBody className="space-y-5">
        <div>
          <Label htmlFor="sim-donor-email">{d.staff.simOptionalDonorEmail}</Label>
          <Input
            id="sim-donor-email"
            name="donorEmail"
            type="email"
            autoComplete="off"
            maxLength={254}
            value={donorEmail}
            onChange={(e) => setDonorEmail(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={d.staff.simTitle}>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => simulateRecordDonationStep(donorEmail))}
            className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.staff.simRunRecord}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => simulateProcessingStep(simDonationId ?? null))}
            className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.staff.simRunProcessing}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => simulateComponentsStep(simDonationId ?? null))}
            className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.staff.simRunComponents}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => simulateTransferStep(simRbcComponentId ?? null))}
            className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.staff.simRunTransfer}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => simulateReceiveStep(simRbcComponentId ?? null))}
            className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.staff.simRunReceive}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => simulateTransfusionStep(simRbcComponentId ?? null))}
            className="rounded-lg border border-teal-600/30 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:border-teal-600/60 hover:bg-teal-50 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.staff.simRunTransfusion}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => simulateFullJourneyStep(donorEmail))}
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.staff.simRunFullJourney}
          </button>
        </div>

        {result ? (
          result.ok ? (
            <div className="space-y-3">
              <Alert type="success">{result.message}</Alert>
              {steps.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-ink">{d.staff.simChecklistTitle}</p>
                  <ol className="space-y-1.5">
                    {steps.map((label) => (
                      <li key={label} className="flex items-start gap-2 text-sm text-ink-soft">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                        <span>{label}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {result.linkCode ? (
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-white px-2 py-1 font-mono text-sm font-bold ring-1 ring-teal-600/30">
                    {result.linkCode}
                  </code>
                  <CopyButton value={result.linkCode} label={d.staff.copyCode} copiedLabel={d.staff.copied} />
                  <span className="text-xs text-ink-faint">{d.staff.linkCodeIssued}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div role="alert">
              <Alert type="error">{result.message}</Alert>
            </div>
          )
        ) : null}
      </CardBody>
    </Card>
  );
}
