import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { prisma } from "@/packages/database/client";
import { listCampsForOrganizer } from "@/lib/services/camps";
import { CreateCampForm } from "./CreateCampForm";
import { CampCancelButton } from "./CampCancelButton";

const STATUS_TONES: Record<string, "teal" | "amber" | "crimson" | "neutral"> = {
  APPROVED: "teal",
  PENDING_APPROVAL: "amber",
  REJECTED: "crimson",
  CANCELLED: "neutral",
  COMPLETED: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "campStatusAPPROVED",
  PENDING_APPROVAL: "campStatusPENDING_APPROVAL",
  REJECTED: "campStatusREJECTED",
  CANCELLED: "campStatusCANCELLED",
  COMPLETED: "campStatusCOMPLETED",
};

function fmt(date: Date): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Org-admin view: register camps for verification and track their status. */
export async function CampsPanel({ organizationId }: { organizationId: string }) {
  const d = getDictionary();
  const camps = await listCampsForOrganizer(organizationId);
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true, regionLabel: true },
  });

  return (
    <section aria-labelledby="camps-heading" className="space-y-4">
      <div>
        <h2 id="camps-heading" className="text-xl font-bold tracking-tight text-ink">
          {d.admin.campsManageTitle}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">{d.admin.campsManageIntro}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{d.admin.campCreateTitle}</CardTitle>
          </CardHeader>
          <CardBody>
            <CreateCampForm organizationId={organizationId} disabled={org?.status !== "ACTIVE"} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{d.admin.campsTitle}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {camps.length === 0 ? (
              <p className="text-sm text-ink-faint">{d.admin.campsEmpty}</p>
            ) : (
              <ul className="space-y-3">
                {camps.map((camp) => (
                  <li key={camp.id} className="rounded-lg border border-ink/10 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{camp.name}</p>
                      <Badge tone={STATUS_TONES[camp.status] ?? "neutral"}>
                        {d.admin[STATUS_LABELS[camp.status] as keyof typeof d.admin] ?? camp.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {camp.venue}, {camp.city} · {fmt(camp.startsAt)} → {fmt(camp.endsAt)} ·{" "}
                      {camp.registrations.length} {d.camps.registerButton.toLowerCase()}
                    </p>
                    {camp.status === "REJECTED" && camp.rejectedReason ? (
                      <p className="mt-1 text-xs text-crimson-700">
                        {d.admin.campRejectedReason.replace("{reason}", camp.rejectedReason)}
                      </p>
                    ) : null}
                    {["PENDING_APPROVAL", "APPROVED"].includes(camp.status) ? (
                      <div className="mt-2">
                        <CampCancelButton campId={camp.id} organizationId={organizationId} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </section>
  );
}
