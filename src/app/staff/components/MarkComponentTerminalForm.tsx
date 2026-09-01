"use client";

import { CsrfField } from "@/components/site/Csrf";
import { useActionState } from "react";
import { Alert, buttonClasses, Card, CardBody, CardHeader, Input, Label, Select } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { markComponentDiscardedAction, markComponentExpiredAction } from "../actions";
import type { ComponentOption, OpsActionState } from "../types";

export function MarkComponentTerminalForm({
  organizationId,
  components,
  kind,
}: {
  organizationId: string;
  components: ComponentOption[];
  kind: "expired" | "discarded";
}) {
  const d = getDictionary();
  const [state, formAction] = useActionState<OpsActionState | null, FormData>(
    kind === "expired" ? markComponentExpiredAction : markComponentDiscardedAction,
    null
  );
  const title = kind === "expired" ? d.staff.bbExpireTitle : d.staff.bbDiscardTitle;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
        <CsrfField />
          <input type="hidden" name="organizationId" value={organizationId} />
          <div>
            <Label htmlFor={`terminal-component-${kind}`}>{d.staff.labelComponent}</Label>
            <Select id={`terminal-component-${kind}`} name="componentId" required defaultValue="">
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
            <Label htmlFor={`terminal-reason-${kind}`}>{d.staff.labelReasonOptional}</Label>
            <Input id={`terminal-reason-${kind}`} name="reason" maxLength={200} />
          </div>

          {state ? (
            <div role={state.ok ? "status" : "alert"}>
              <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
            </div>
          ) : null}

          <button type="submit" className={buttonClasses("secondary")}>
            {title}
          </button>
        </form>
      </CardBody>
    </Card>
  );
}
