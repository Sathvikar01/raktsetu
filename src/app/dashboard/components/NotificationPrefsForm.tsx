"use client";

import { useActionState } from "react";
import { getDictionary, LOCALES } from "@/i18n";
import { Alert, Label, Select } from "@/packages/ui";
import { SubmitButton } from "@/components/site/SubmitButton";
import { saveNotificationPreferencesAction } from "../actions";
import type { DonorActionState } from "../types";

export interface NotificationPrefsDefaults {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
  descriptiveContent: boolean;
  locale: string;
}

const CHANNELS = [
  { name: "inApp", labelKey: "channelInApp" },
  { name: "email", labelKey: "channelEmail" },
  { name: "sms", labelKey: "channelSms" },
  { name: "whatsapp", labelKey: "channelWhatsapp" },
  { name: "push", labelKey: "channelPush" },
] as const;

export function NotificationPrefsForm({ defaults }: { defaults: NotificationPrefsDefaults }) {
  const d = getDictionary();
  const [state, formAction] = useActionState<DonorActionState | null, FormData>(
    saveNotificationPreferencesAction,
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      {state ? (
        <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
      ) : null}

      <fieldset>
        <legend className="text-sm font-medium text-ink">{d.donor.prefsTitle}</legend>
        <div className="mt-3 space-y-2.5">
          {CHANNELS.map(({ name, labelKey }) => (
            <label key={name} htmlFor={`pref-${name}`} className="flex items-center gap-3 text-sm text-ink-soft">
              <input
                id={`pref-${name}`}
                type="checkbox"
                name={name}
                defaultChecked={defaults[name]}
                className="size-4 rounded border-ink/30 accent-teal-600"
              />
              {d.donor[labelKey]}
            </label>
          ))}
          <label
            htmlFor="pref-descriptive"
            className="flex items-center gap-3 text-sm text-ink-soft"
          >
            <input
              id="pref-descriptive"
              type="checkbox"
              name="descriptiveContent"
              defaultChecked={defaults.descriptiveContent}
              className="size-4 rounded border-ink/30 accent-teal-600"
            />
            <span>
              {d.donor.descriptiveContent}
              <span className="block text-xs text-ink-faint">{d.donor.descriptiveHint}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="max-w-48">
        <Label htmlFor="pref-locale">{d.donor.localeLabel}</Label>
        <Select id="pref-locale" name="locale" defaultValue={defaults.locale}>
          {LOCALES.map((code) => (
            <option key={code} value={code}>
              {d.donor.localeEn}
            </option>
          ))}
        </Select>
      </div>

      <SubmitButton pendingLabel={d.common.loading} size="md">
        {d.common.save}
      </SubmitButton>
    </form>
  );
}
