import type { ReactNode } from "react";

/**
 * Guided workflow wrapper: numbers each operational step and carries a
 * plain-language hint, so staff screens read as a lifecycle order rather
 * than a pile of unrelated forms.
 */
export function StepCard({
  n,
  title,
  hint,
  optional,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl2 border border-ink/5 bg-white shadow-card">
      <div className="flex items-start gap-3 border-b border-ink/5 px-4 py-3 sm:px-5">
        <span
          aria-hidden
          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            optional ? "bg-canvas text-ink-faint ring-1 ring-ink/10" : "bg-teal-600 text-white"
          }`}
        >
          {n}
        </span>
        <div>
          <h4 className="text-sm font-semibold text-ink">
            {title}
            {optional ? (
              <span className="ml-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
                only if needed
              </span>
            ) : null}
          </h4>
          {hint ? <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
