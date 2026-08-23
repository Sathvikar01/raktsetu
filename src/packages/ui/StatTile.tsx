import type { HTMLAttributes } from "react";

export interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  hint?: string;
}

export function StatTile({ label, value, hint, className, ...rest }: StatTileProps) {
  return (
    <div className={`rs-card px-6 py-5 ${className ?? ""}`} {...rest}>
      <p className="text-3xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      <p className="mt-1 text-sm font-medium text-teal-700">{label}</p>
      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}
