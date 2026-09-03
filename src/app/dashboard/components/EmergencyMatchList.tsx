"use client";

import { useState, useTransition } from "react";
import { MapPin, Siren } from "lucide-react";
import { Alert, Badge, Card, CardBody, EmptyState, buttonClasses } from "@/packages/ui";
import { getDictionary, DEFAULT_LOCALE, translate } from "@/i18n";
import { readCsrfCookie } from "@/components/site/Csrf";
import type { DonorMatchView } from "@/lib/services/emergency-requests";
import { respondToDonorMatchAction } from "../actions";

/** Donor's emergency match queue — accept shares contact, decline stands down. */
export function EmergencyMatchList({ matches }: { matches: DonorMatchView[] }) {
  const d = getDictionary();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  if (matches.length === 0) {
    return <EmptyState icon={Siren} title={d.donor.matchesNone} />;
  }

  function respond(matchId: string, accept: boolean) {
    setNote(null);
    startTransition(async () => {
      const result = await respondToDonorMatchAction(readCsrfCookie(), matchId, accept);
      setNote({
        ok: result.ok,
        text: translate(DEFAULT_LOCALE, result.messageKey ?? "common.errorGeneric"),
      });
    });
  }

  function urgencyLabel(urgency: string): string {
    return translate(DEFAULT_LOCALE, `requests.urgency${urgency.charAt(0)}${urgency.slice(1).toLowerCase()}`);
  }

  return (
    <div className="space-y-4">
      {note ? <Alert type={note.ok ? "success" : "error"}>{note.text}</Alert> : null}
      <ul className="space-y-4">
        {matches.map((match) => {
          const expired = match.status === "NOTIFIED" && match.requestExpiresAt < new Date();
          return (
            <li key={match.matchId}>
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{match.hospitalName}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {match.status === "NOTIFIED" ? (
                        <Badge tone={expired ? "neutral" : "amber"}>
                          {expired ? d.donor.matchExpiredBadge : d.requests.statusPENDING}
                        </Badge>
                      ) : match.status === "ACCEPTED" ? (
                        <Badge tone="teal">{d.requests.statusFULFILLED}</Badge>
                      ) : (
                        <Badge tone="neutral">{match.status}</Badge>
                      )}
                      <Badge tone="outline">
                        <MapPin className="mr-1 inline size-3" aria-hidden />
                        {d.donor.matchDistance.replace("{km}", String(match.approxDistanceKm))}
                      </Badge>
                    </div>
                  </div>
                  <dl className="space-y-0.5 text-sm text-ink-soft">
                    <div>
                      <dt className="inline font-medium">{d.donor.matchColGroup}: </dt>
                      <dd className="inline">
                        {match.bloodGroup} ·{" "}
                        {d.components[match.componentType as keyof typeof d.components] as string} ·{" "}
                        {d.donor.matchUnits
                          .replace("{units}", String(match.unitsRequested))
                          .replace("{component}", "")}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">{d.donor.matchColWhere}: </dt>
                      <dd className="inline">{match.city}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">{d.donor.matchUrgency.replace("{urgency}", "")}</dt>
                      <dd className="inline">{urgencyLabel(match.urgency)}</dd>
                    </div>
                    <div className="text-xs text-ink-faint">
                      {d.donor.matchColWhen}:{" "}
                      {new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: "short", timeStyle: "short" }).format(
                        match.notifiedAt
                      )}
                    </div>
                  </dl>
                  {match.status === "NOTIFIED" && !expired ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => respond(match.matchId, true)}
                        disabled={pending}
                        className={buttonClasses("primary", "sm")}
                      >
                        {d.donor.matchAccept}
                      </button>
                      <button
                        type="button"
                        onClick={() => respond(match.matchId, false)}
                        disabled={pending}
                        className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-ink/5"
                      >
                        {d.donor.matchDecline}
                      </button>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-ink-faint">{d.donor.matchesIntro}</p>
    </div>
  );
}
