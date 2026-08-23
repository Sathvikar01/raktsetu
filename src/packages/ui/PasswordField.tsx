"use client";

import { useId, useState } from "react";
import { Circle, CircleCheck, Eye, EyeOff } from "lucide-react";
import { Input } from "./Input";
import { Label } from "./Label";

export interface PasswordFieldProps {
  name: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  showLabel: string;
  hideLabel: string;
  /** When provided, live requirement hints are rendered (registration). */
  hintLength?: string;
  hintMixed?: string;
}

function passwordHints(value: string) {
  return [
    value.length >= 10,
    /[a-zA-Z]/.test(value) && /[0-9]/.test(value),
  ];
}

export function PasswordField({
  name,
  label,
  autoComplete,
  required,
  minLength,
  showLabel,
  hideLabel,
  hintLength,
  hintMixed,
}: PasswordFieldProps) {
  const id = useId();
  const hintId = `${id}-hints`;
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const withHints = hintLength !== undefined && hintMixed !== undefined;
  const hintsOk = passwordHints(value);
  const hintTexts = [hintLength, hintMixed];

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          className="pr-11"
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          aria-describedby={withHints ? hintId : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-teal-50 hover:text-teal-700"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
      {withHints ? (
        <ul id={hintId} aria-live="polite" className="mt-2 space-y-1">
          {hintTexts.map((text, i) =>
            text ? (
              <li key={text} className="flex items-center gap-1.5 text-xs">
                {hintsOk[i] ? (
                  <CircleCheck className="size-3.5 shrink-0 text-teal-600" aria-hidden />
                ) : (
                  <Circle className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
                )}
                <span className={hintsOk[i] ? "text-teal-700" : "text-ink-faint"}>{text}</span>
              </li>
            ) : null
          )}
        </ul>
      ) : null}
    </div>
  );
}
