"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { CheckCircle2, Phone, Users } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Stepper, buttonClasses } from "@/packages/ui";
import { getDictionary, DEFAULT_LOCALE, translate } from "@/i18n";
import { stageMeta, type EmergencyStatus } from "@/packages/domain/emergency";
import type { PublicEmergencyStatus } from "@/lib/services/emergency-requests";
import {
  confirmEmergencyFulfilledAction,
  cancelEmergencyRequestAction,
} from "../actions";

/**
 * Live status view. Polls the public status endpoint — each poll also nudges
 * the resolution pipeline server-side, so the requester watches stage changes
 * in near-real-time without any login.
 */
export function EmergencyStatusView({
  token,
  initial,
}: {
  token: string;
  initial: PublicEmergencyStatus;
}) {
  const d = getDictionary();
  const [status, setStatus] = useState<PublicEmergencyStatus>(initial);
  const [error, setError] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/emergency/status/${token}`, { cache: "no-store" });
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = (await res.json()) as { ok: boolean; status: PublicEmergencyStatus | null };
      if (body.ok && body.status) setStatus(body.status);
    } catch {
      setError(true);
    }
  }, [token]);

  useEffect(() => {
    const terminal = ["FULFILLED", "EXPIRED", "CANCELLED"].includes(status.status);
    if (terminal) return;
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh, status.status]);

  const meta = stageMeta(status.status);
  const steps = [d.emergency.stepPending, d.emergency.stepBanks, d.emergency.stepDonors, d.emergency.stepMatched, d.emergency.stepDone];
  const terminal = ["FULFILLED", "EXPIRED", "CANCELLED"].includes(status.status);
  const currentStep = terminal ? (status.status === "FULFILLED" ? 4 : 0) : meta.step;

  const stageLine = (() => {
    switch (status.status) {
      case "PENDING": return d.emergency.stagePending;
      case "SEARCHING_BANKS": return d.emergency.stageSearchingBanks;
      case "SEARCHING_DONORS": return d.emergency.stageSearchingDonors;
      case "DONOR_FOUND": return d.emergency.stageDonorFound;
      case "FULFILLED": return d.emergency.stageFulfilled;
      case "EXPIRED": return d.emergency.stageExpired;
      case "CANCELLED": return d.emergency.stageCancelled;
      default: return d.emergency.stagePending;
    }
  })();

  function markFulfilled() {
    startTransition(async () => {
      const result = await confirmEmergencyFulfilledAction(token);
      if (result.messageKey) setNote(translate(DEFAULT_LOCALE, result.messageKey));
      await refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelEmergencyRequestAction(token);
      if (result.messageKey) setNote(translate(DEFAULT_LOCALE, result.messageKey));
      await refresh();
    });
  }

  function stageLabel(stage: string): string {
    const params: Record<string, string | number> = {};
    if (stage === "RADIUS_EXPANDED") {
      params.radiusKm = status.currentRadiusKm ?? 0;
    }
    if (stage === "DONORS_NOTIFIED") {
      params.count = status.donorProgress.notified;
      params.radiusKm = status.currentRadiusKm ?? 0;
    }
    const key = `emergency.stage_${stage}`;
    const template = translate(DEFAULT_LOCALE, key);
    return template.replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? `{${p}}`));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{d.emergency.statusMetaTitle.replace("{number}", status.requestNumber)}</CardTitle>
            <Badge
              tone={
                status.status === "FULFILLED"
                  ? "teal"
                  : status.status === "EXPIRED" || status.status === "CANCELLED"
                    ? "neutral"
                    : "amber"
              }
            >
              {translate(DEFAULT_LOCALE, `emergency.status${status.status as EmergencyStatus}`)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {status.hospitalName} · {status.city} · {status.bloodGroup} ·{" "}
            {d.components[status.componentType as keyof typeof d.components] as string} ·{" "}
            {status.unitsRequested} {d.requests.colUnits.toLowerCase()}
          </p>
        </CardHeader>
        <CardBody className="space-y-5">
          {error ? <Alert type="warn">{d.emergency.stagePending}</Alert> : null}
          {note ? <Alert type="success">{note}</Alert> : null}

          <Stepper
            steps={steps.map((label) => ({ label }))}
            current={currentStep}
            ariaLabel={d.emergency.pipelineTitle}
          />
          <p className="text-sm font-medium text-ink">{stageLine}</p>

          <ul className="space-y-1.5" aria-label={d.emergency.timelineTitle}>
            {status.timeline.map((entry, i) => (
              <li key={`${entry.stage}-${i}`} className="flex items-start gap-2 text-sm text-ink-soft">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden />
                <span>
                  {stageLabel(entry.stage)}
                  <span className="ml-2 text-xs text-ink-faint">
                    {new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: "short", timeStyle: "short" }).format(entry.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {status.currentRadiusKm && !terminal ? (
            <p className="text-xs text-ink-faint">
              {d.emergency.currentRadius.replace("{radius}", String(status.currentRadiusKm))}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{d.emergency.banksFoundTitle}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {status.banks.length === 0 ? (
              <p className="text-sm text-ink-faint">{d.emergency.banksNoneYet}</p>
            ) : (
              <ul className="space-y-2">
                {status.banks.map((bank, i) => (
                  <li key={`${bank.name}-${i}`} className="flex items-center justify-between rounded-lg border border-ink/10 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-ink">{bank.name}</p>
                      {bank.areaLabel ? <p className="text-xs text-ink-faint">{bank.areaLabel}</p> : null}
                    </div>
                    <div className="text-right">
                      <Badge tone="teal">{bank.unitsAvailable} ✓</Badge>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {d.emergency.distanceApprox
                          ? d.emergency.distanceApprox.replace("{km}", String(bank.approxDistanceKm))
                          : `~${bank.approxDistanceKm} km`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Users className="mr-1.5 inline size-4 text-teal-700" aria-hidden />
              {d.emergency.stepDonors}
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {status.donorContact ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink">{d.emergency.donorContactTitle}</p>
                <p className="flex items-start gap-2 rounded-lg border border-teal-600/25 bg-teal-50 px-3 py-2 text-sm text-teal-900">
                  <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {d.emergency.donorContactBody
                    .replace("{name}", status.donorContact.firstName)
                    .replace("{group}", status.donorContact.bloodGroup)
                    .replace("{distance}", String(status.donorContact.approxDistanceKm))
                    .replace("{phone}", status.donorContact.maskedPhone)}
                </p>
                <p className="text-xs text-ink-faint">{d.emergency.donorPrivacyNote}</p>
              </div>
            ) : status.donorProgress.notified > 0 ? (
              <p className="text-sm text-ink-soft">
                {d.emergency.donorsWaiting.replace("{count}", String(status.donorProgress.notified))}
              </p>
            ) : (
              <p className="text-sm text-ink-faint">{d.emergency.donorsNoneYet}</p>
            )}
            {status.donorProgress.accepted > 0 ? (
              <p className="text-sm font-medium text-teal-700">
                {d.emergency.donorsAccepted.replace("{count}", String(status.donorProgress.accepted))}
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {!terminal && (status.status === "DONOR_FOUND" || status.status === "SEARCHING_DONORS" || status.status === "SEARCHING_BANKS") ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={markFulfilled} disabled={pending} className={buttonClasses("primary", "md")}>
            {d.emergency.markFulfilled}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-lg border border-crimson-600/30 bg-white px-3 py-1.5 text-sm font-medium text-crimson-700 hover:bg-crimson-50"
          >
            {d.emergency.cancelRequest}
          </button>
        </div>
      ) : null}
    </div>
  );
}
