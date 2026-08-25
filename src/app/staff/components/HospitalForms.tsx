"use client";

import { useActionState } from "react";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  Select,
} from "@/packages/ui";
import { getDictionary } from "@/i18n";
import {
  hospitalDiscardComponentAction,
  hospitalIssueComponentAction,
  hospitalReceiveComponentAction,
  hospitalReturnComponentAction,
  hospitalTransfuseComponentAction,
} from "../actions";
import type { ComponentOption, OpsActionState, OptionItem } from "../types";
import { ScanOrSelect } from "./ScanOrSelect";

type HospitalAction =
  | typeof hospitalReceiveComponentAction
  | typeof hospitalIssueComponentAction
  | typeof hospitalReturnComponentAction
  | typeof hospitalDiscardComponentAction;

function HospitalSimpleForm({
  organizationId,
  components,
  action,
  titleKey,
  submitLabel,
  extraField,
}: {
  organizationId: string;
  components: ComponentOption[];
  action: HospitalAction;
  titleKey: string;
  submitLabel: string;
  extraField?: "issuedToRef" | "reason";
}) {
  const d = getDictionary();
  const [state, formAction] = useActionState<OpsActionState | null, FormData>(action, null);
  const idSuffix = extraField ?? "plain";

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-ink">{titleKey}</h3>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <ScanOrSelect
            id={`hp-component-${idSuffix}`}
            name="componentId"
            options={components}
            label={d.staff.labelComponent}
            pickPlaceholder={d.staff.optionPickComponent}
            organizationId={organizationId}
            scope="hospital"
          />

          {extraField === "issuedToRef" ? (
            <div>
              <Label htmlFor="hp-issued-to">{d.staff.labelIssuedToRef}</Label>
              <Input
                id="hp-issued-to"
                name="issuedToRef"
                maxLength={64}
                placeholder={d.staff.placeholderIssuedToRef}
              />
            </div>
          ) : null}
          {extraField === "reason" ? (
            <div>
              <Label htmlFor={`hp-reason-${idSuffix}`}>{d.staff.labelReasonOptional}</Label>
              <Input id={`hp-reason-${idSuffix}`} name="reason" maxLength={200} />
            </div>
          ) : null}

          {state ? (
            <div role={state.ok ? "status" : "alert"}>
              <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
            </div>
          ) : null}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:pointer-events-none disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </form>
      </CardBody>
    </Card>
  );
}

export function ReceiveForm(props: { organizationId: string; incoming: ComponentOption[] }) {
  const d = getDictionary();
  if (props.incoming.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-ink">{d.staff.hospReceiveTitle}</h3>
          <p className="mt-1 text-sm text-ink-soft">{d.staff.hospIncomingEmpty}</p>
        </CardHeader>
      </Card>
    );
  }
  return (
    <HospitalSimpleForm
      organizationId={props.organizationId}
      components={props.incoming}
      action={hospitalReceiveComponentAction}
      titleKey={d.staff.hospReceiveTitle}
      submitLabel={d.staff.hospReceiveTitle}
    />
  );
}

export function IssueForm(props: { organizationId: string; units: ComponentOption[] }) {
  const d = getDictionary();
  return (
    <HospitalSimpleForm
      organizationId={props.organizationId}
      components={props.units}
      action={hospitalIssueComponentAction}
      titleKey={d.staff.hospIssueTitle}
      submitLabel={d.staff.hospIssueTitle}
      extraField="issuedToRef"
    />
  );
}

export function ReturnForm(props: { organizationId: string; units: ComponentOption[] }) {
  const d = getDictionary();
  return (
    <HospitalSimpleForm
      organizationId={props.organizationId}
      components={props.units}
      action={hospitalReturnComponentAction}
      titleKey={d.staff.hospReturnTitle}
      submitLabel={d.staff.hospReturnTitle}
      extraField="reason"
    />
  );
}

export function DiscardUnitForm(props: { organizationId: string; units: ComponentOption[] }) {
  const d = getDictionary();
  return (
    <HospitalSimpleForm
      organizationId={props.organizationId}
      components={props.units}
      action={hospitalDiscardComponentAction}
      titleKey={d.staff.hospDiscardTitle}
      submitLabel={d.staff.hospDiscardTitle}
      extraField="reason"
    />
  );
}

export function TransfuseForm({
  organizationId,
  units,
  levels,
  categories,
  ageBands,
}: {
  organizationId: string;
  units: ComponentOption[];
  levels: OptionItem[];
  categories: OptionItem[];
  ageBands: OptionItem[];
}) {
  const d = getDictionary();
  const [state, formAction] = useActionState<OpsActionState | null, FormData>(
    hospitalTransfuseComponentAction,
    null
  );

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-ink">{d.staff.hospTransfuseTitle}</h3>
        <p className="mt-1 text-sm text-ink-soft">{d.staff.transfuseIntro}</p>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />

          <ScanOrSelect
            id="tf-component"
            name="componentId"
            options={units}
            label={d.staff.labelComponent}
            pickPlaceholder={d.staff.optionPickComponent}
            organizationId={organizationId}
            scope="hospital"
          />

          {/* Disclosure sub-form */}
          <fieldset className="space-y-4 rounded-xl2 border border-ink/10 bg-canvas/60 px-4 py-4">
            <legend className="px-1 text-sm font-semibold text-ink">{d.staff.disclosureHeading}</legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="tf-level">{d.staff.labelLevel}</Label>
                <Select id="tf-level" name="level" defaultValue="NONE" required>
                  {levels.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="tf-category">{d.staff.labelCategory}</Label>
                <Select id="tf-category" name="category" defaultValue="">
                  <option value="">{d.staff.categoryNoneOption}</option>
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="tf-age-band">{d.staff.labelAgeBand}</Label>
                <Select id="tf-age-band" name="ageBand" defaultValue="">
                  <option value="">{d.staff.ageBandNoneOption}</option>
                  {ageBands.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="tf-recipient-ref">{d.staff.labelRecipientRef}</Label>
                <Input
                  id="tf-recipient-ref"
                  name="recipientRef"
                  required
                  minLength={8}
                  maxLength={64}
                  pattern="[A-Za-z0-9_-]{8,64}"
                  placeholder={d.staff.placeholderRecipientRef}
                />
              </div>
            </div>

            <div className="flex items-start gap-2">
              <input
                id="tf-consent"
                name="patient_consent_verified"
                type="checkbox"
                className="mt-0.5 size-4 rounded border-ink/30 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-500/40"
              />
              <label htmlFor="tf-consent" className="text-sm text-ink">
                {d.staff.labelConsent}{" "}
                <span className="text-ink-faint">({d.staff.consentHintBroad})</span>
              </label>
            </div>
          </fieldset>

          {state ? (
            <div role={state.ok ? "status" : "alert"}>
              <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
            </div>
          ) : null}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-crimson-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-crimson-700 disabled:pointer-events-none disabled:opacity-60"
          >
            {d.staff.hospTransfuseTitle}
          </button>
        </form>
      </CardBody>
    </Card>
  );
}
