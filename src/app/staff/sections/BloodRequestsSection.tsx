import { Badge, Card, CardBody, CardHeader, EmptyState, Label, Table, TBody, TD, TH, THead, TR } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { prisma } from "@/packages/database/client";
import type { ComponentType } from "@/packages/schemas/events";
import { listFulfillableComponents } from "@/lib/services/inventory";
import { listIncomingRequests, listOutgoingRequests } from "@/lib/services/requests";
import { cancelBloodRequestAction, declineBloodRequestAction } from "../actions";
import { CsrfInput } from "@/components/site/CsrfInput";
import { BloodRequestForm } from "../components/BloodRequestForm";
import { FulfillRequestForm } from "../components/FulfillRequestForm";

function urgencyTone(urgency: string): "crimson" | "amber" | "neutral" {
  if (urgency === "EMERGENCY") return "crimson";
  if (urgency === "URGENT") return "amber";
  return "neutral";
}

function statusTone(status: string): "teal" | "amber" | "crimson" | "neutral" {
  if (status === "FULFILLED") return "teal";
  if (status === "DECLINED") return "crimson";
  if (status === "PENDING") return "amber";
  return "neutral";
}

function urgencyLabel(urgency: string): string {
  const d = getDictionary();
  const key = `urgency${urgency}` as "urgencyEMERGENCY" | "urgencyURGENT" | "urgencyROUTINE";
  return d.requests[key] ?? urgency;
}

function statusLabel(status: string): string {
  const d = getDictionary();
  const key = `status${status}` as
    | "statusPENDING"
    | "statusFULFILLED"
    | "statusDECLINED"
    | "statusCANCELLED";
  return d.requests[key] ?? status;
}

/** Blood-bank side: open requests from hospitals + reservation workflow. */
export async function IncomingRequestsPanel({ organizationId }: { organizationId: string }) {
  const d = getDictionary();
  const requests = await listIncomingRequests(organizationId);

  const withOptions = await Promise.all(
    requests.map(async (request) => {
      const fulfillable = await listFulfillableComponents(
        organizationId,
        request.componentType,
        request.bloodGroup
      );
      const fulfilledIds = new Set(request.fulfillments.map((f) => f.componentId));
      return {
        request,
        options: fulfillable
          .filter((c) => !fulfilledIds.has(c.id))
          .map((c) => ({
            value: c.id,
            label:
              (c.externalComponentId ?? "?") +
              ` · ${c.expiresAt ? new Intl.DateTimeFormat("en", { dateStyle: "short" }).format(c.expiresAt) : "—"}`,
          })),
        fulfilledCount: request.fulfillments.length,
      };
    })
  );

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-ink">{d.requests.incomingTitle}</h3>
      </CardHeader>
      <CardBody>
        {withOptions.length === 0 ? (
          <EmptyState title={d.requests.noIncoming} />
        ) : (
          <ul className="space-y-4">
            {withOptions.map(({ request, options, fulfilledCount }) => (
              <li key={request.id} className="rounded-2xl border border-ink/10 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{request.requestingOrg.name}</span>
                  <Badge tone={urgencyTone(request.urgency)}>{urgencyLabel(request.urgency)}</Badge>
                  <Badge tone="outline">
                    {d.components[request.componentType as ComponentType] ?? request.componentType} · {request.bloodGroup}
                  </Badge>
                  <Badge tone="neutral">
                    {d.requests.colFulfilled}: {fulfilledCount}/{request.unitsRequested}
                  </Badge>
                  {fulfilledCount >= request.unitsRequested ? (
                    <Badge tone="teal">{statusLabel("FULFILLED")}</Badge>
                  ) : (
                    <Badge tone="amber">{statusLabel("PENDING")}</Badge>
                  )}
                </div>
                {request.note ? (
                  <p className="mt-2 text-sm text-ink-soft">“{request.note}”</p>
                ) : null}

                <FulfillRequestForm
                  organizationId={organizationId}
                  requestId={request.id}
                  unitsRemaining={request.unitsRequested - fulfilledCount}
                  options={options}
                />

                <form action={declineBloodRequestAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <CsrfInput />
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="requestId" value={request.id} />
                  <div>
                    <Label htmlFor={`decline-${request.id}`}>{d.requests.declineReasonLabel}</Label>
                    <input
                      id={`decline-${request.id}`}
                      name="reason"
                      required
                      minLength={4}
                      maxLength={200}
                      className="rs-input w-56 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg border border-crimson-600/30 bg-white px-3 py-1.5 text-sm font-medium text-crimson-700 transition-colors hover:border-crimson-600/60 hover:bg-crimson-50"
                  >
                    {d.requests.declineButton}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Hospital side: request form + the org's own requests with live status. */
export async function HospitalRequestsPanel({ organizationId }: { organizationId: string }) {
  const d = getDictionary();
  const [targetOrgs, outgoing] = await Promise.all([
    prisma.organization.findMany({
      where: {
        status: "ACTIVE",
        kind: { in: ["BLOOD_BANK", "BLOOD_BANK_AND_HOSPITAL"] },
        id: { not: organizationId },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listOutgoingRequests(organizationId),
  ]);

  return (
    <div className="space-y-5">
      <BloodRequestForm
        organizationId={organizationId}
        targetOrgs={targetOrgs.map((o) => ({ value: o.id, label: o.name }))}
      />
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-ink">{d.requests.outgoingTitle}</h3>
        </CardHeader>
        <CardBody>
          {outgoing.length === 0 ? (
            <EmptyState title={d.requests.noOutgoing} />
          ) : (
            <Table caption={d.requests.outgoingTitle}>
              <THead>
                <TR>
                  <TH>{d.requests.colTarget}</TH>
                  <TH>{d.requests.colFor}</TH>
                  <TH>{d.requests.colUrgency}</TH>
                  <TH>{d.requests.colFulfilled}</TH>
                  <TH>{d.common.status}</TH>
                  <TH>
                    <span className="sr-only">{d.common.submit}</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {outgoing.map((request) => (
                  <TR key={request.id}>
                    <TD className="font-medium text-ink">{request.targetOrg.name}</TD>
                    <TD>
                      {d.components[request.componentType as ComponentType] ?? request.componentType} · {request.bloodGroup} · {request.unitsRequested}
                    </TD>
                    <TD>
                      <Badge tone={urgencyTone(request.urgency)}>{urgencyLabel(request.urgency)}</Badge>
                    </TD>
                    <TD>{request.fulfillments.length}/{request.unitsRequested}</TD>
                    <TD>
                      <Badge tone={statusTone(request.status)}>{statusLabel(request.status)}</Badge>
                      {request.status === "DECLINED" && request.declineReason ? (
                        <span className="ml-2 text-xs text-ink-faint">{request.declineReason}</span>
                      ) : null}
                    </TD>
                    <TD>
                      {request.status === "PENDING" ? (
                        <form action={cancelBloodRequestAction} className="flex items-center">
                          <CsrfInput />
                          <input type="hidden" name="organizationId" value={organizationId} />
                          <input type="hidden" name="requestId" value={request.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-crimson-600/40 hover:text-crimson-700"
                          >
                            {d.requests.cancel}
                          </button>
                        </form>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
