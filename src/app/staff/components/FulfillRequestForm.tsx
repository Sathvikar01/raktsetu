"use client";

import { CsrfField } from "@/components/site/Csrf";
import { useActionState } from "react";
import { Alert, buttonClasses, Label } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { fulfillBloodRequestAction } from "../actions";
import type { OpsActionState, OptionItem } from "../types";

/** Blood-bank side: pick matching AVAILABLE units to reserve against a request. */
export function FulfillRequestForm({
  organizationId,
  requestId,
  unitsRemaining,
  options,
}: {
  organizationId: string;
  requestId: string;
  unitsRemaining: number;
  options: OptionItem[];
}) {
  const d = getDictionary();
  const [state, formAction] = useActionState<OpsActionState | null, FormData>(fulfillBloodRequestAction, null);

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-xl border border-ink/10 bg-canvas p-3">
      <CsrfField />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="requestId" value={requestId} />
      {options.length > 0 ? (
        <fieldset>
          <Label>{d.requests.colFor}</Label>
          <div className="mt-1 max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {options.map((o, i) => (
              <label key={o.value} className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="componentIds"
                  value={o.value}
                  disabled={i >= unitsRemaining}
                  className="mt-0.5 size-4 rounded border-ink/30 accent-teal-700"
                />
                <span className="font-mono text-xs leading-5">{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-ink-soft">{d.requests.matchingNone}</p>
      )}

      {state ? (
        <div role={state.ok ? "status" : "alert"}>
          <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
        </div>
      ) : null}

      {options.length > 0 ? (
        <button type="submit" className={buttonClasses("primary")}>
          {d.requests.fulfillButton}
        </button>
      ) : null}
    </form>
  );
}
