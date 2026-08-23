"use client";

import { useActionState } from "react";
import { Alert, Card, CardBody, CardHeader, Input, Label, Select } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { transferComponentAction } from "../actions";
import type { ComponentOption, OpsActionState } from "../types";

export function TransferComponentForm({
  organizationId,
  components,
}: {
  organizationId: string;
  components: ComponentOption[];
}) {
  const d = getDictionary();
  const [state, formAction] = useActionState<OpsActionState | null, FormData>(transferComponentAction, null);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-ink">{d.staff.bbTransferTitle}</h3>
        <p className="mt-1 text-sm text-ink-soft">{d.staff.bbTransferIntro}</p>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <div>
            <Label htmlFor="tr-component">{d.staff.labelComponent}</Label>
            <Select id="tr-component" name="componentId" required defaultValue="">
              <option value="" disabled>
                {d.staff.optionPickComponent}
              </option>
              {components.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-destination">{d.staff.labelDestinationCode}</Label>
            <Input
              id="tr-destination"
              name="destinationFacilityExternalCode"
              required
              maxLength={64}
              placeholder={d.staff.placeholderDestinationCode}
            />
          </div>

          {state ? (
            <div role={state.ok ? "status" : "alert"}>
              <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
            </div>
          ) : null}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.staff.transferComponent}
          </button>
        </form>
      </CardBody>
    </Card>
  );
}
