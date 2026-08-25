"use client";

import { useTransition } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Two-step destructive action: first click reveals a required reason +
 * explicit confirmation; the underlying server action only fires after both.
 */
export function DestructiveAction({
  label,
  confirmLabel,
  cancelLabel,
  reasonLabel,
  reasonPlaceholder,
  warning,
  disabled,
  className,
  runAction,
}: {
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  warning: string;
  disabled?: boolean;
  className?: string;
  runAction: (reason: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  function arm(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.closest("details")?.setAttribute("open", "");
  }

  return (
    <details className="group/details relative">
      <summary className="list-none">
        <button
          type="button"
          disabled={disabled}
          onClick={arm}
          aria-label={label}
          className={className}
        >
          <AlertTriangle className="size-3.5" aria-hidden />
          {label}
        </button>
      </summary>
      <div
        role="alertdialog"
        aria-label={confirmLabel}
        className="absolute right-0 z-20 mt-2 w-72 space-y-2 rounded-xl border border-crimson-600/25 bg-white p-3 text-left shadow-lift"
      >
        <p className="text-xs font-medium leading-relaxed text-crimson-700">{warning}</p>
        <textarea
          name="reason"
          rows={2}
          maxLength={200}
          placeholder={reasonPlaceholder}
          aria-label={reasonLabel}
          className="rs-input w-full text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={(e) => {
              const root = e.currentTarget.closest('[role="alertdialog"]');
              const reason =
                root?.querySelector<HTMLInputElement>('textarea[name="reason"]')?.value.trim() ??
                "";
              if (reason.length < 4) return;
              startTransition(async () => {
                await runAction(reason);
              });
              e.currentTarget.closest("details")?.removeAttribute("open");
            }}
            className="rounded-lg bg-crimson-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-crimson-700 disabled:pointer-events-none disabled:opacity-60"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-canvas"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </details>
  );
}
