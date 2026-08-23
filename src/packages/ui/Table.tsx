import type { ReactNode } from "react";

export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="rs-card overflow-x-auto">
      <table className="w-full text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-ink/10 bg-canvas/60">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-faint ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-ink/5">{children}</tbody>;
}

export function TR({ children }: { children: ReactNode }) {
  return <tr className="align-top">{children}</tr>;
}

export function TD({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3 text-ink-soft ${className ?? ""}`}>{children}</td>
  );
}
