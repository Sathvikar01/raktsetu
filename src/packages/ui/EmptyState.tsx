import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ink/15 bg-white/70 px-6 py-12 text-center">
      {Icon ? <Icon className="size-8 text-ink-faint" aria-hidden /> : null}
      <p className="font-semibold text-ink">{title}</p>
      {body ? <p className="max-w-md text-sm leading-relaxed text-ink-soft">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
