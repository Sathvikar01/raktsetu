"use client";

import { useActionState } from "react";
import { Alert, buttonClasses, Card, CardBody, CardHeader, Label, Select } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { completeProcessingAction } from "../actions";
import type { DonationOption, OpsActionState } from "../types";

export function CompleteProcessingForm({
  organizationId,
  donations,
}: {
  organizationId: string;
  donations: DonationOption[];
}) {
  const d = getDictionary();
  const [state, formAction] = useActionState<OpsActionState | null, FormData>(completeProcessingAction, null);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-ink">{d.staff.bbProcessingTitle}</h3>
        <p className="mt-1 text-sm text-ink-soft">{d.staff.bbProcessingIntro}</p>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <div>
            <Label htmlFor="proc-donation">{d.staff.labelDonation}</Label>
            <Select id="proc-donation" name="donationId" required defaultValue="">
              <option value="" disabled>
                {d.staff.optionPickDonation}
              </option>
              {donations.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          {state ? (
            <div role={state.ok ? "status" : "alert"}>
              <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
            </div>
          ) : null}

          <button
            type="submit"
            className={buttonClasses("primary")}
          >
            {d.common.submit}
          </button>
        </form>
      </CardBody>
    </Card>
  );
}
