"use client";

import { useActionState } from "react";
import { getDictionary } from "@/i18n";
import { Alert, Input, Label } from "@/packages/ui";
import { SubmitButton } from "@/components/site/SubmitButton";
import { linkDonationAction } from "../actions";
import type { DonorActionState } from "../types";

export function LinkDonationForm() {
  const d = getDictionary();
  const [state, formAction] = useActionState<DonorActionState | null, FormData>(
    linkDonationAction,
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      {state && !state.ok ? (
        <Alert type="error">{state.message}</Alert>
      ) : null}
      {state?.ok ? <Alert type="success">{state.message}</Alert> : null}
      <div>
        <Label htmlFor="link-code">{d.donor.linkCodeLabel}</Label>
        <Input
          id="link-code"
          name="linkCode"
          required
          minLength={6}
          maxLength={32}
          autoComplete="off"
          error={state !== null && !state.ok}
          className="font-mono uppercase"
        />
      </div>
      <SubmitButton pendingLabel={d.common.loading} size="md">
        {d.donor.linkSubmit}
      </SubmitButton>
    </form>
  );
}
