import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/packages/ui";
import { getDictionary, DEFAULT_LOCALE, translate } from "@/i18n";
import { listEmergencyBankMatches } from "@/lib/services/emergency-requests";

const fmt = new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" });

/**
 * Blood-bank staff view of the public emergency network: requests whose
 * compatible stock matched this bank. Read-only — units are still reserved
 * through the standard hospital-request fulfillment flow.
 */
export async function EmergencyRequestsSection({ organizationId }: { organizationId: string }) {
  const d = getDictionary();
  const matches = await listEmergencyBankMatches(organizationId);

  return (
    <section aria-labelledby="emergencies-heading" className="space-y-4">
      <div>
        <h2 id="emergencies-heading" className="text-xl font-semibold tracking-tight text-ink">
          {d.staff.emergencyPanelTitle}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">{d.staff.emergencyPanelIntro}</p>
      </div>

      {matches.length === 0 ? (
        <EmptyState title={d.staff.emergencyNone} />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-4 py-3 font-medium">{d.staff.emergencyColRequest}</th>
                  <th className="px-4 py-3 font-medium">{d.staff.emergencyColHospital}</th>
                  <th className="px-4 py-3 font-medium">{d.staff.emergencyColNeeded}</th>
                  <th className="px-4 py-3 font-medium">{d.staff.emergencyColUnits}</th>
                  <th className="px-4 py-3 font-medium">{d.staff.emergencyColDistance}</th>
                  <th className="px-4 py-3 font-medium">{d.staff.emergencyColStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {matches.map((match) => {
                  const urgencyKey = `requests.urgency${
                    match.request.urgency.charAt(0) + match.request.urgency.slice(1).toLowerCase()
                  }` as const;
                  return (
                    <tr key={match.matchId}>
                      <td className="px-4 py-3 font-mono text-xs">{match.request.requestNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{match.request.hospitalName}</p>
                        <p className="text-xs text-ink-faint">{match.request.city}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="outline">{match.request.bloodGroup}</Badge>{" "}
                        <span className="text-xs text-ink-soft">
                          {d.components[match.request.componentType as keyof typeof d.components] as string}
                        </span>{" "}
                        <span className="text-xs text-ink-faint">
                          {translate(DEFAULT_LOCALE, urgencyKey)} · {match.request.unitsRequested}u
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={match.unitsAvailable >= match.request.unitsRequested ? "teal" : "amber"}>
                          {match.unitsAvailable}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {d.staff.emergencyDistance.replace("{km}", String(match.approxDistanceKm))}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-soft">
                        {translate(
                          DEFAULT_LOCALE,
                          `emergency.status${match.request.status as "PENDING"}`
                        )}
                        <br />
                        <span className="text-ink-faint">{fmt.format(match.request.expiresAt)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </section>
  );
}
