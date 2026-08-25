import type { ReactNode } from "react";

export interface TimelineItem {
  title: string;
  date?: string;
  /** Pre-formatted date node (e.g. timezone-aware client component). */
  dateNode?: ReactNode;
  body?: string;
  icon?: ReactNode;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative space-y-8 border-l-2 border-teal-100 pl-6">
      {items.map((item, i) => (
        <li key={i} className="relative">
          {item.icon ? (
            <span
              aria-hidden
              className="absolute -left-[37px] flex size-7 -translate-y-0.5 items-center justify-center rounded-full bg-teal-100 text-teal-700 ring-4 ring-canvas"
            >
              {item.icon}
            </span>
          ) : (
            <span
              aria-hidden
              className="absolute -left-[27px] top-1 size-3 rounded-full bg-teal-500 ring-4 ring-teal-100"
            />
          )}
          <div className={item.icon ? "pt-0.5" : undefined}>
            <p className="font-semibold text-ink">{item.title}</p>
            {item.dateNode ?? (item.date ? <p className="mt-0.5 text-xs text-ink-faint">{item.date}</p> : null)}
            {item.body ? (
              <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">{item.body}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
