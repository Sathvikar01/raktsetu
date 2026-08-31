"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, buttonClasses, Card, CardBody, CardHeader, Input, Label, Select } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { createComponentsAction } from "../actions";
import type { DonationOption, OpsActionState, OptionItem } from "../types";

interface Row {
  type: string;
  ext: string;
}

export function CreateComponentsForm({
  organizationId,
  donations,
  componentTypes,
}: {
  organizationId: string;
  donations: DonationOption[];
  componentTypes: OptionItem[];
}) {
  const d = getDictionary();
  const [state, formAction] = useActionState<OpsActionState | null, FormData>(createComponentsAction, null);
  const [rows, setRows] = useState<Row[]>([{ type: componentTypes[0]?.value ?? "RBC", ext: "" }]);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-ink">{d.staff.bbComponentsTitle}</h3>
        <p className="mt-1 text-sm text-ink-soft">{d.staff.bbComponentsIntro}</p>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="rowCount" value={rows.length} />
          <div>
            <Label htmlFor="cc-donation">{d.staff.labelDonation}</Label>
            <Select id="cc-donation" name="donationId" required defaultValue="">
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

          <fieldset className="space-y-3">
            <legend className="sr-only">{d.staff.bbComponentsTitle}</legend>
            {rows.map((row, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_1fr_auto] sm:items-end">
                <div>
                  <Label htmlFor={`comp-type-${index}`}>{d.staff.labelComponentType}</Label>
                  <Select
                    id={`comp-type-${index}`}
                    name={`compType_${index}`}
                    value={row.type}
                    onChange={(e) => updateRow(index, { type: e.target.value })}
                  >
                    {componentTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`comp-ext-${index}`}>{d.staff.labelExternalComponentId}</Label>
                  <Input
                    id={`comp-ext-${index}`}
                    name={`compExt_${index}`}
                    value={row.ext}
                    maxLength={128}
                    required
                    onChange={(e) => updateRow(index, { ext: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  disabled={rows.length <= 1}
                  aria-label={d.staff.removeRow}
                  className={`${buttonClasses("ghost", "sm")} text-crimson-600 hover:bg-crimson-50`}
                >
                  <Trash2 className="size-4" aria-hidden />
                  <span className="sr-only sm:not-sr-only">{d.staff.removeRow}</span>
                </button>
              </div>
            ))}
          </fieldset>

          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { type: componentTypes[0]?.value ?? "RBC", ext: "" }])}
            className={buttonClasses("secondary", "sm")}
          >
            <Plus className="size-4" aria-hidden />
            {d.staff.addComponentRow}
          </button>

          {state ? (
            <div role={state.ok ? "status" : "alert"}>
              <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
            </div>
          ) : null}

          <div>
            <button
              type="submit"
              className={buttonClasses("primary")}
            >
              {d.staff.createComponents}
            </button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
