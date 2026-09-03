"use client";

import { CsrfField } from "@/components/site/Csrf";
import { useActionState } from "react";
import { Alert, buttonClasses, Card, CardBody, CardHeader, Input, Label, Select, Textarea } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { BLOOD_GROUPS, COMPONENT_TYPES } from "@/packages/schemas/events";
import { createBloodRequestAction } from "../actions";
import type { OpsActionState, OptionItem } from "../types";

/** Hospital-side: ask a partner blood bank for units of a given type × group. */
export function BloodRequestForm({
  organizationId,
  targetOrgs,
}: {
  organizationId: string;
  targetOrgs: OptionItem[];
}) {
  const d = getDictionary();
  const [state, formAction] = useActionState<OpsActionState | null, FormData>(createBloodRequestAction, null);

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-ink">{d.requests.formTitle}</h3>
        <p className="mt-1 text-sm text-ink-soft">{d.requests.formIntro}</p>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <CsrfField />
          <input type="hidden" name="organizationId" value={organizationId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="req-target">{d.requests.labelTargetOrg}</Label>
              <Select id="req-target" name="targetOrgId" required defaultValue="">
                <option value="" disabled>—</option>
                {targetOrgs.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="req-type">{d.inventory.filterType}</Label>
              <Select id="req-type" name="componentType" required defaultValue="RBC">
                {COMPONENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {d.components[t] ?? t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="req-group">{d.inventory.filterGroup}</Label>
              <Select id="req-group" name="bloodGroup" required defaultValue="O+">
                {BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="req-units">{d.requests.labelUnits}</Label>
              <Input id="req-units" name="unitsRequested" type="number" min={1} max={20} defaultValue={1} required />
            </div>
            <div>
              <Label htmlFor="req-urgency">{d.requests.labelUrgency}</Label>
              <Select id="req-urgency" name="urgency" defaultValue="ROUTINE">
                <option value="ROUTINE">{d.requests.urgencyROUTINE}</option>
                <option value="URGENT">{d.requests.urgencyURGENT}</option>
                <option value="EMERGENCY">{d.requests.urgencyEMERGENCY}</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="req-note">{d.requests.labelNote}</Label>
            <Textarea id="req-note" name="note" maxLength={300} rows={2} />
          </div>

          {state ? (
            <div role={state.ok ? "status" : "alert"}>
              <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
            </div>
          ) : null}

          <button type="submit" className={buttonClasses("primary")} disabled={targetOrgs.length === 0}>
            {d.requests.createButton}
          </button>
        </form>
      </CardBody>
    </Card>
  );
}
