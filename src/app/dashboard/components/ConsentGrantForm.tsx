"use client";

import { CsrfField } from "@/components/site/Csrf";
import { useActionState } from "react";
import { getDictionary } from "@/i18n";
import { Alert, Label, Select } from "@/packages/ui";
import { SubmitButton } from "@/components/site/SubmitButton";
import { recordConsentAction } from "../actions";
import {
  DONOR_CONSENT_PURPOSES,
  type DonorActionState,
  type DonorConsentPurpose,
} from "../types";

type PurposeLabelKey =
  | "purposeLifecycleNotifications"
  | "purposeNotificationsEmail"
  | "purposeNotificationsDescriptive"
  | "purposeDataExport";

const PURPOSE_LABEL_KEYS: Record<DonorConsentPurpose, PurposeLabelKey> = {
  "account.lifecycle_notifications": "purposeLifecycleNotifications",
  "notifications.email": "purposeNotificationsEmail",
  "notifications.descriptive": "purposeNotificationsDescriptive",
  "data.export": "purposeDataExport",
};

export function ConsentGrantForm() {
  const d = getDictionary();
  const [state, formAction] = useActionState<DonorActionState | null, FormData>(
    recordConsentAction,
    null
  );

  return (
    <form action={formAction} className="space-y-3">
        <CsrfField />
      {state ? (
        <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
      ) : null}
      <p className="text-sm text-ink-soft">{d.donor.consentGrantBody}</p>
      <input type="hidden" name="policyVersion" value="1.0" />
      <div className="max-w-sm">
        <Label htmlFor="consent-purpose">{d.donor.consentPurpose}</Label>
        <Select id="consent-purpose" name="purposeKey" required defaultValue={undefined}>
          {DONOR_CONSENT_PURPOSES.map((purpose) => (
            <option key={purpose} value={purpose}>
              {d.donor[PURPOSE_LABEL_KEYS[purpose]]}
            </option>
          ))}
        </Select>
      </div>
      <SubmitButton pendingLabel={d.common.loading} size="md" variant="secondary">
        {d.common.submit}
      </SubmitButton>
    </form>
  );
}
