import { Badge, Table, TBody, TD, TH, THead, TR } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { prisma } from "@/packages/database/client";
import type { VerificationStatus } from "@/packages/schemas/events";

/** Read-only lifecycle feed: last 20 events for the organization. */
export async function RecentActivity({ organizationId }: { organizationId: string }) {
  const d = getDictionary();
  const events = await prisma.lifecycleEvent.findMany({
    where: { organizationId },
    orderBy: [{ occurredAt: "desc" }],
    take: 20,
    select: {
      id: true,
      eventType: true,
      occurredAt: true,
      sourceSystem: true,
      verificationStatus: true,
    },
  });

  const verificationBadge = (status: string) =>
    status === "VERIFIED" ? (
      <Badge tone="teal">{d.staff.verificationVERIFIED}</Badge>
    ) : status === "PENDING" ? (
      <Badge tone="amber">{d.staff.verificationPENDING}</Badge>
    ) : (
      <Badge tone="crimson">{d.staff.verificationREJECTED}</Badge>
    );

  return (
    <section aria-labelledby="activity-heading" className="space-y-4">
      <h2 id="activity-heading" className="text-xl font-bold tracking-tight text-ink">
        {d.staff.recentActivity}
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-ink-soft">{d.staff.noActivity}</p>
      ) : (
        <Table caption={d.staff.recentActivity}>
          <THead>
            <TR>
              <TH>{d.staff.colEvent}</TH>
              <TH>{d.staff.colOccurredAt}</TH>
              <TH>{d.staff.colSource}</TH>
              <TH>{d.staff.colVerification}</TH>
            </TR>
          </THead>
          <TBody>
            {events.map((e) => (
              <TR key={e.id}>
                <TD className="font-medium text-ink">
                  {d.privacy.event[e.eventType as keyof (typeof d)["privacy"]["event"]] ?? e.eventType}
                </TD>
                <TD>
                  {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(e.occurredAt)}
                </TD>
                <TD>{e.sourceSystem}</TD>
                <TD>{verificationBadge(e.verificationStatus as VerificationStatus)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}
