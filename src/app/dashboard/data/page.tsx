import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  SectionHeading,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { buildDonorDataExport, type DonorDataExport } from "@/lib/services/data-export";
import { DownloadButton } from "./DownloadButton";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.donor.data.title };
}

const INVENTORY_ROWS = [
  "account",
  "donations",
  "components",
  "consents",
  "prefs",
  "notifications",
] as const;

type InventoryRow = (typeof INVENTORY_ROWS)[number];

function rowCopy(d: ReturnType<typeof getDictionary>, row: InventoryRow) {
  const data = d.donor.data;
  switch (row) {
    case "account":
      return { stored: data.rowAccountLabel, why: data.rowAccountWhy, example: data.rowAccountExample };
    case "donations":
      return { stored: data.rowDonationsLabel, why: data.rowDonationsWhy, example: data.rowDonationsExample };
    case "components":
      return { stored: data.rowComponentsLabel, why: data.rowComponentsWhy, example: data.rowComponentsExample };
    case "consents":
      return { stored: data.rowConsentsLabel, why: data.rowConsentsWhy, example: data.rowConsentsExample };
    case "prefs":
      return { stored: data.rowPrefsLabel, why: data.rowPrefsWhy, example: data.rowPrefsExample };
    case "notifications":
      return { stored: data.rowNotificationsLabel, why: data.rowNotificationsWhy, example: data.rowNotificationsExample };
  }
}

export default async function YourDataPage() {
  const user = await requireRole("DONOR");
  const d = getDictionary();
  const data: DonorDataExport = await buildDonorDataExport(user.id);

  await recordAudit({
    actorType: "USER",
    actorId: user.id,
    action: "data.exported",
    resourceType: "User",
    resourceId: user.id,
  });

  const dd = d.donor.data;

  return (
    <div className="space-y-6">
      <SectionHeading
        headingLevel="h1"
        title={dd.title}
        body={dd.intro}
      />

      <Card>
        <CardHeader>
          <CardTitle>{dd.inventoryTitle}</CardTitle>
        </CardHeader>
        <CardBody>
          <Table>
            <THead>
              <TR>
                <TH>{dd.colStored}</TH>
                <TH>{dd.colWhy}</TH>
                <TH>{dd.colExample}</TH>
              </TR>
            </THead>
            <TBody>
              {INVENTORY_ROWS.map((row) => {
                const copy = rowCopy(d, row);
                return (
                  <TR key={row}>
                    <TD className="font-medium text-ink">{copy.stored}</TD>
                    <TD>{copy.why}</TD>
                    <TD className="text-ink-faint">{copy.example}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{dd.notStoredTitle}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{dd.notStoredBody}</p>
          </div>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-700" aria-hidden />
            {dd.privacyNote}
          </p>
          <DownloadButton data={data} />
        </CardBody>
      </Card>
    </div>
  );
}
