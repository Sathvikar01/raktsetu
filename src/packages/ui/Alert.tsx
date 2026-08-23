import type { ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert, XCircle } from "lucide-react";

export type AlertType = "info" | "warn" | "success" | "error";

const STYLES: Record<AlertType, string> = {
  info: "border-teal-600/20 bg-teal-50 text-teal-900",
  warn: "border-amber-600/25 bg-amber-50 text-amber-900",
  success: "border-emerald-600/25 bg-emerald-50 text-emerald-900",
  error: "border-crimson-600/25 bg-crimson-50 text-crimson-900",
};

const ICONS: Record<AlertType, ReactNode> = {
  info: <Info className="size-5 shrink-0 text-teal-600" aria-hidden />,
  warn: <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden />,
  success: <CircleCheck className="size-5 shrink-0 text-emerald-600" aria-hidden />,
  error: <XCircle className="size-5 shrink-0 text-crimson-600" aria-hidden />,
};

export interface AlertProps {
  type?: AlertType;
  title?: string;
  children: ReactNode;
}

export function Alert({ type = "info", title, children }: AlertProps) {
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${STYLES[type]}`}
    >
      {ICONS[type]}
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}
