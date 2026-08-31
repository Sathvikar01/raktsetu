"use client";

import { useActionState } from "react";
import { Alert, buttonClasses, Card, CardBody, CardHeader, Input, Label } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { transferComponentAction } from "../actions";
import type { ComponentOption, OpsActionState } from "../types";
import { ScanOrSelect } from "./ScanOrSelect";

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
          <ScanOrSelect
            id="tr-component"
            name="componentId"
            options={components}
            label={d.staff.labelComponent}
            pickPlaceholder={d.staff.optionPickComponent}
            organizationId={organizationId}
            scope="transfer"
          />
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

          <button type="submit" className={buttonClasses("primary")}>
            {d.staff.transferComponent}
          </button>
        </form>
      </CardBody>
    </Card>
  );
}
