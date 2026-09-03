"use client";

import { useState, useTransition } from "react";
import { Alert, Input, Label } from "@/packages/ui";
import { getDictionary } from "@/i18n";
import { readCsrfCookie } from "@/components/site/Csrf";
import { createCampAction } from "../camp-actions";

function parseDateTimeLocal(value: string): string | null {
  // datetime-local gives a wall-clock string; send it as-is, server parses it.
  return value.length >= 16 ? value : null;
}

/** Camp registration form for ORG_ADMINs — submits for platform verification. */
export function CreateCampForm({
  organizationId,
  disabled,
}: {
  organizationId: string;
  disabled: boolean;
}) {
  const d = getDictionary();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    venue: "",
    city: "",
    state: "",
    latitude: "",
    longitude: "",
    startsAt: "",
    endsAt: "",
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit() {
    setNote(null);
    startTransition(async () => {
      const result = await createCampAction(readCsrfCookie(), organizationId, {
        ...form,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
      });
      if (result.ok) {
        setForm({
          name: "",
          description: "",
          venue: "",
          city: "",
          state: "",
          latitude: "",
          longitude: "",
          startsAt: "",
          endsAt: "",
        });
      }
      setNote({
        ok: result.ok,
        text: result.ok ? d.admin.campCreated : result.messageKey ?? d.admin.errValidation,
      });
    });
  }

  if (disabled) {
    return <p className="text-sm text-ink-faint">{d.admin.noOrgs}</p>;
  }

  return (
    <div className="space-y-3">
      {note ? <Alert type={note.ok ? "success" : "error"}>{note.text}</Alert> : null}
      <div>
        <Label htmlFor="camp-name">{d.admin.campLabelName}</Label>
        <Input id="camp-name" value={form.name} onChange={set("name")} maxLength={160} required />
      </div>
      <div>
        <Label htmlFor="camp-desc">{d.admin.campLabelDescription}</Label>
        <Input id="camp-desc" value={form.description} onChange={set("description")} maxLength={500} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="camp-venue">{d.admin.campLabelVenue}</Label>
          <Input id="camp-venue" value={form.venue} onChange={set("venue")} maxLength={200} required />
        </div>
        <div>
          <Label htmlFor="camp-city">{d.admin.campLabelCity}</Label>
          <Input id="camp-city" value={form.city} onChange={set("city")} maxLength={80} required />
        </div>
        <div>
          <Label htmlFor="camp-state">{d.admin.campLabelState}</Label>
          <Input id="camp-state" value={form.state} onChange={set("state")} maxLength={80} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="camp-starts">{d.admin.campLabelStartsAt}</Label>
          <Input id="camp-starts" type="datetime-local" value={form.startsAt} onChange={set("startsAt")} required />
        </div>
        <div>
          <Label htmlFor="camp-ends">{d.admin.campLabelEndsAt}</Label>
          <Input id="camp-ends" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} required />
        </div>
      </div>
      <div>
        <Label htmlFor="camp-lat">{d.admin.campLabelCoordinates}</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="camp-lat" type="number" step="0.0001" value={form.latitude} onChange={set("latitude")} />
          <Input
            aria-label={d.admin.campLabelCoordinates}
            type="number"
            step="0.0001"
            value={form.longitude}
            onChange={set("longitude")}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending || parseDateTimeLocal(form.startsAt) === null || parseDateTimeLocal(form.endsAt) === null}
        className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
      >
        {pending ? d.common.loading : d.admin.campSubmit}
      </button>
    </div>
  );
}
