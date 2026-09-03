"use client";

import { CsrfField } from "@/components/site/Csrf";
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
  donationReminders: boolean;
  locale: string;
}

type ChannelName = "inApp" | "email" | "sms" | "whatsapp" | "push";

const CHANNELS: Array<{ name: ChannelName; labelKey: string; comingSoon?: boolean }> = [
  { name: "inApp", labelKey: "channelInApp" },
  { name: "email", labelKey: "channelEmail" },
  // No delivery adapters exist yet — shown as coming-soon so prefs never
  // promise a channel that stays silent (honesty over aspiration).
  { name: "sms", labelKey: "channelSms", comingSoon: true },
  { name: "whatsapp", labelKey: "channelWhatsapp", comingSoon: true },
  { name: "push", labelKey: "channelPush", comingSoon: true },
];

export function NotificationPrefsForm({ defaults }: { defaults: NotificationPrefsDefaults }) {
  const d = getDictionary();
  const [state, formAction] = useActionState<DonorActionState | null, FormData>(
    saveNotificationPreferencesAction,
    null
  );

  return (
    <form action={formAction} className="space-y-4">
        <CsrfField />
      {state ? (
        <Alert type={state.ok ? "success" : "error"}>{state.message}</Alert>
      ) : null}

      <fieldset>
        <legend className="text-sm font-medium text-ink">{d.donor.prefsTitle}</legend>
        <div className="mt-3 space-y-2.5">
          {CHANNELS.map(({ name, labelKey, comingSoon }) => (
            <label key={name} htmlFor={`pref-${name}`} className={`flex items-center gap-3 text-sm ${comingSoon ? "text-ink-faint" : "text-ink-soft"}`}>
              <input
                id={`pref-${name}`}
                type="checkbox"
                name={name}
                defaultChecked={defaults[name]}
                disabled={comingSoon}
                className="size-4 rounded border-ink/30 accent-teal-600"
              />
              {d.donor[labelKey as keyof typeof d.donor] as string}
              {comingSoon ? (
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-ink-faint ring-1 ring-inset ring-ink/10">
                  {d.donor.channelComingSoon}
                </span>
              ) : null}
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
          <label
            htmlFor="pref-reminders"
            className="flex items-center gap-3 text-sm text-ink-soft"
          >
            <input
              id="pref-reminders"
              type="checkbox"
              name="donationReminders"
              defaultChecked={defaults.donationReminders}
              className="size-4 rounded border-ink/30 accent-teal-600"
            />
            <span>
              {d.donor.donationReminders}
              <span className="block text-xs text-ink-faint">{d.donor.donationRemindersHint}</span>
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
