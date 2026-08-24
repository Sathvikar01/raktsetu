"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { getDictionary } from "@/i18n";
import { Alert, Input, Label, Select, Textarea } from "@/packages/ui";
import { buttonClasses } from "@/packages/ui";

export function RequestForm() {
  const d = getDictionary();
  const t = d.public.partnerRequest;
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const orgName = String(fd.get("orgName") ?? "").trim();
    const orgKind = String(fd.get("orgKind") ?? "").trim();
    const contactName = String(fd.get("contactName") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();

    if (!orgName || !orgKind || !contactName || !email) {
      setError("Please fill in organisation name, type, contact person and work email.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Please enter a valid work email.");
      return;
    }
    setError(null);
    setSubmitted(true);
    // In a real deployment this would POST to an admin queue / create a PENDING_APPROVAL org.
    // For this open-source demo we show success locally and guide to GitHub Discussions.
  }

  if (submitted) {
    return (
      <div className="space-y-5">
        <Alert type="success">
          <span className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">{t.successTitle}</span>
              <span className="mt-1 block text-sm leading-relaxed opacity-90">{t.successBody}</span>
            </span>
          </span>
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Link href="/partner/login" className={buttonClasses("primary", "md")}>
            {t.successCtaLogin}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/partners" className={buttonClasses("secondary", "md")}>
            {t.successCtaPartners}
          </Link>
        </div>
        <details className="group rounded-lg border border-ink/10 bg-canvas px-4 py-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink marker:content-none">
            {t.demoHintTitle}
            <ArrowRight className="ml-auto size-4 text-ink-faint transition-transform group-open:rotate-90" aria-hidden />
          </summary>
          <p className="mt-2 text-xs leading-5 text-ink-soft">{t.demoHintBody}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {["bb-staff@demo.local", "hosp-staff@demo.local", "admin@demo.local"].map((a) => (
              <li key={a}>
                <code className="rounded-md border border-ink/10 bg-white px-2 py-0.5 font-mono text-xs text-ink">{a}</code>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">
            Password: <code className="rounded-md border border-ink/10 bg-white px-2 py-0.5 font-mono text-xs">demo-pass-1234</code>
          </p>
        </details>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? <Alert type="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="req-orgName">{t.orgName} *</Label>
          <Input id="req-orgName" name="orgName" required maxLength={120} placeholder="e.g., Seva Blood Centre" />
        </div>
        <div>
          <Label htmlFor="req-orgKind">{t.orgKind} *</Label>
          <Select id="req-orgKind" name="orgKind" required defaultValue="">
            <option value="" disabled>
              {t.orgKindPlaceholder}
            </option>
            <option value="BLOOD_BANK">{t.kindBloodBank}</option>
            <option value="HOSPITAL">{t.kindHospital}</option>
            <option value="NGO">{t.kindNgo}</option>
            <option value="OTHER">{t.kindOther}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="req-contactName">{t.contactName} *</Label>
          <Input id="req-contactName" name="contactName" required maxLength={80} />
        </div>
        <div>
          <Label htmlFor="req-email">{t.email} *</Label>
          <Input id="req-email" name="email" type="email" required maxLength={254} inputMode="email" />
        </div>
        <div>
          <Label htmlFor="req-phone">{t.phone}</Label>
          <Input id="req-phone" name="phone" type="tel" maxLength={30} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="req-message">{t.message}</Label>
          <Textarea id="req-message" name="message" rows={4} maxLength={800} placeholder={t.messagePlaceholder} />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">{t.trustNote}</p>

      <button type="submit" className={buttonClasses("primary", "md")}>
        {t.submit}
        <ArrowRight className="size-4" aria-hidden />
      </button>

      <p className="text-sm text-ink-soft">
        {t.alreadyPartner}{" "}
        <Link href="/partner/login" className="font-medium text-teal-700 underline-offset-4 hover:underline">
          {t.signInHere}
        </Link>
      </p>
    </form>
  );
}
