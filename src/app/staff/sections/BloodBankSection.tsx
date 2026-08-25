import { COMPONENT_TYPES, type ComponentType } from "@/packages/schemas/events";
import { getDictionary } from "@/i18n";
import { prisma } from "@/packages/database/client";
import { RecordDonationForm } from "../components/RecordDonationForm";
import { CompleteProcessingForm } from "../components/CompleteProcessingForm";
import { CreateComponentsForm } from "../components/CreateComponentsForm";
import { TransferComponentForm } from "../components/TransferComponentForm";
import { MarkComponentTerminalForm } from "../components/MarkComponentTerminalForm";
import { StepCard } from "../components/StepCard";

/** Blood-bank operations panel — org kind BLOOD_BANK or BLOOD_BANK_AND_HOSPITAL. */
export async function BloodBankSection({ organizationId }: { organizationId: string }) {
  const d = getDictionary();

  const [facilities, donations, transferable, terminable] = await Promise.all([
    prisma.facility.findMany({
      where: { organizationId },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
    prisma.donation.findMany({
      where: { organizationId },
      orderBy: { donatedAt: "desc" },
      take: 50,
      select: { id: true, externalDonationId: true, din: true, donatedAt: true, linkStatus: true },
    }),
    prisma.bloodComponent.findMany({
      where: {
        donation: { organizationId },
        currentDerivedState: { in: ["AVAILABLE", "RESERVED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        externalComponentId: true,
        componentType: true,
        currentDerivedState: true,
        donation: { select: { externalDonationId: true } },
      },
    }),
    prisma.bloodComponent.findMany({
      where: {
        donation: { organizationId },
        currentDerivedState: {
          in: ["PREPARING", "AVAILABLE", "RESERVED", "TRANSFERRED", "RECEIVED", "ISSUED", "RETURNED"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        externalComponentId: true,
        componentType: true,
        currentDerivedState: true,
        donation: { select: { externalDonationId: true } },
      },
    }),
  ]);

  const facilityOptions = facilities.map((f) => ({
    value: f.code,
    label: `${f.name} (${f.code})`,
  }));

  const donationOptions = donations.map((donation) => ({
    value: donation.id,
    label:
      donation.externalDonationId +
      (donation.din ? ` · ${donation.din}` : "") +
      ` · ${new Intl.DateTimeFormat("en", { dateStyle: "short" }).format(donation.donatedAt)}` +
      ` · ${donation.linkStatus}`,
  }));

  function componentLabel(c: {
    externalComponentId: string | null;
    componentType: string;
    currentDerivedState: string;
    donation: { externalDonationId: string };
  }): string {
    return (
      (c.externalComponentId ?? "?") +
      ` · ${d.components[c.componentType as ComponentType] ?? c.componentType}` +
      ` · ${c.currentDerivedState}`
    );
  }

  const transferOptions = transferable.map((c) => ({ value: c.id, label: componentLabel(c) }));
  const terminalOptions = terminable.map((c) => ({ value: c.id, label: componentLabel(c) }));
  const componentTypeOptions = COMPONENT_TYPES.map((t) => ({
    value: t,
    label: d.components[t] ?? t,
  }));

  return (
    <section aria-labelledby="bb-panel-heading" className="space-y-4">
      <h2 id="bb-panel-heading" className="text-xl font-bold tracking-tight text-ink">
        {d.staff.panelBloodBank}
      </h2>
      <div className="space-y-5 xl:columns-2 xl:gap-5">
        <StepCard n={1} title={d.staff.stepRecordTitle} hint={d.staff.stepRecordHint}>
          <RecordDonationForm organizationId={organizationId} facilities={facilityOptions} />
        </StepCard>
        <StepCard n={2} title={d.staff.stepProcessTitle} hint={d.staff.stepProcessHint}>
          <CompleteProcessingForm organizationId={organizationId} donations={donationOptions} />
        </StepCard>
        <StepCard n={3} title={d.staff.stepComponentsTitle} hint={d.staff.stepComponentsHint}>
          <CreateComponentsForm
            organizationId={organizationId}
            donations={donationOptions}
            componentTypes={componentTypeOptions}
          />
        </StepCard>
        <StepCard n={4} title={d.staff.stepTransferTitle} hint={d.staff.stepTransferHint}>
          <TransferComponentForm organizationId={organizationId} components={transferOptions} />
        </StepCard>
      </div>
      <div className="space-y-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
          {d.staff.stepExceptionsLabel}
        </p>
        <StepCard n={5} optional title={d.staff.stepTerminalTitle} hint={d.staff.stepTerminalHint}>
          <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-2">
            <MarkComponentTerminalForm organizationId={organizationId} components={terminalOptions} kind="expired" />
            <MarkComponentTerminalForm organizationId={organizationId} components={terminalOptions} kind="discarded" />
          </div>
        </StepCard>
      </div>
    </section>
  );
}
