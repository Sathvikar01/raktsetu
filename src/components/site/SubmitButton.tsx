"use client";

import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/packages/ui";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "lg",
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClasses(variant, size, `w-full ${className ?? ""}`)}>
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-4 animate-spin">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
