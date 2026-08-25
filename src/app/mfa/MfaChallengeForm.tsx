"use client";

import { useActionState } from "react";
import { Alert, Input, Label, buttonClasses } from "@/packages/ui";
import { DEFAULT_LOCALE, getDictionary, translate } from "@/i18n";
import { confirmMfaEnrollmentAction, verifyMfaAction, type MfaState } from "./actions";

const ERROR_KEYS: Record<NonNullable<MfaState["error"]>, string> = {
  invalid: "mfa.invalidCode",
  expired: "mfa.expired",
  rate_limited: "mfa.rateLimited",
};

/**
 * Shared second-factor form: verifies a TOTP code against the pending-login
 * cookie. mode="challenge" unlocks an enrolled admin; mode="enroll" confirms
 * first-time enrollment.
 */
export function MfaChallengeForm({ mode = "challenge" }: { mode?: "challenge" | "enroll" }) {
  const d = getDictionary();
  const action = mode === "enroll" ? confirmMfaEnrollmentAction : verifyMfaAction;
  const [state, formAction, pending] = useActionState<MfaState | null, FormData>(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="mfa-code">{d.mfa.codeLabel}</Label>
        <Input
          id="mfa-code"
          name="code"
          inputMode="numeric"
          autoComplete={mode === "enroll" ? "one-time-code" : "off"}
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          placeholder="000000"
        />
      </div>

      {state && !state.ok && state.error ? (
        <div role="alert">
          <Alert type="error">{translate(DEFAULT_LOCALE, ERROR_KEYS[state.error])}</Alert>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={buttonClasses("primary", "md") + " disabled:pointer-events-none disabled:opacity-60"}
      >
        {mode === "enroll" ? d.mfa.confirmEnrollment : d.mfa.verifyButton}
      </button>
    </form>
  );
}
