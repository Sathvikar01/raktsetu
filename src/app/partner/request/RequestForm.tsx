"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { getDictionary } from "@/i18n";
import { Alert, Input, Label, Select, Textarea } from "@/packages/ui";
import { buttonClasses, Spinner } from "@/packages/ui";
import { submitPartnerRequestAction } from "./actions";
import type { PartnerRequestState } from "./types";

export function RequestForm() {
  const d = getDictionary();
  const t = d.public.partnerRequest;
  const [state, formAction, pending] = useActionState<PartnerRequestState | null, FormData>(
    submitPartnerRequestAction,
    null
  );

  if (state?.ok) {
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
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state && !state.ok ? <Alert type="error">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="req-orgName">{t.orgName} *</Label>
          <Input id="req-orgName" name="orgName" required maxLength={120} placeholder={t.orgNamePlaceholder} />
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
          </Select>
        </div>
        <div>
          <Label htmlFor="req-contactName">{t.contactName} *</Label>
          <Input id="req-contactName" name="contactName" required maxLength={80} />
        </div>
        <div>
          <Label htmlFor="req-workEmail">{t.email} *</Label>
          <Input id="req-workEmail" name="workEmail" type="email" required maxLength={200} inputMode="email" />
        </div>
        <div>
          <Label htmlFor="req-city">{t.city}</Label>
          <Input id="req-city" name="city" maxLength={80} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="req-message">{t.message}</Label>
          <Textarea id="req-message" name="message" rows={4} maxLength={1000} placeholder={t.messagePlaceholder} />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">{t.trustNote}</p>

      <button type="submit" disabled={pending} className={buttonClasses("primary", "md")}>
        {pending ? <Spinner label={t.submitting} className="size-4" /> : null}
        {pending ? t.submitting : t.submit}
        {!pending ? <ArrowRight className="size-4" aria-hidden /> : null}
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
