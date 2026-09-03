"use client";

import { useState, useTransition } from "react";
import { Alert, Input, Label, buttonClasses } from "@/packages/ui";
import { getDictionary, DEFAULT_LOCALE, translate } from "@/i18n";
import { registerForCampAction } from "./actions";

/** Inline camp registration. Signed-in donors register per account; visitors per IP. */
export function CampRegisterButton({ campId, signedIn }: { campId: string; signedIn: boolean }) {
  const d = getDictionary();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [headcount, setHeadcount] = useState(1);

  function submit() {
    startTransition(async () => {
      const result = await registerForCampAction({ campId, name, phone, headcount });
      setNote({
        ok: result.ok,
        text: translate(DEFAULT_LOCALE, result.messageKey ?? "camps.registerInvalid"),
      });
      if (result.ok) setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClasses("secondary", "sm")}
        >
          {d.camps.registerButton}
        </button>
        {note ? <Alert type={note.ok ? "success" : "error"}>{note.text}</Alert> : null}
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-3 rounded-xl border border-ink/10 bg-white p-4">
      <p className="text-sm font-semibold text-ink">{d.camps.registerTitle}</p>
      {note && !note.ok ? <Alert type="error">{note.text}</Alert> : null}
      <div>
        <Label htmlFor={`camp-name-${campId}`}>{d.camps.registerName}</Label>
        <Input id={`camp-name-${campId}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </div>
      {!signedIn ? (
        <div>
          <Label htmlFor={`camp-phone-${campId}`}>{d.camps.registerPhone}</Label>
          <Input id={`camp-phone-${campId}`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
        </div>
      ) : null}
      <div>
        <Label htmlFor={`camp-headcount-${campId}`}>{d.camps.registerHeadcount}</Label>
        <Input
          id={`camp-headcount-${campId}`}
          type="number"
          min={1}
          max={5}
          value={headcount}
          onChange={(e) => setHeadcount(Number(e.target.value))}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || name.trim().length < 2}
          className={buttonClasses("primary", "sm")}
        >
          {pending ? d.common.loading : d.camps.registerButton}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm text-ink-soft hover:bg-ink/5"
        >
          {d.common.cancel}
        </button>
      </div>
    </div>
  );
}
