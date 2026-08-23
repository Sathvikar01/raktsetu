import type { HTMLAttributes } from "react";

export type BadgeTone =
  | "neutral"
  | "teal"
  | "crimson"
  | "amber"
  | "orange"
  | "green"
  | "outline";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-ink/5 text-ink-soft ring-ink/10",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/20",
  crimson: "bg-crimson-50 text-crimson-700 ring-crimson-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  outline: "bg-white text-ink-soft ring-ink/15",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className ?? ""}`}
      {...rest}
    />
  );
}

export const COMPONENT_TONES: Record<string, BadgeTone> = {
  RBC: "crimson",
  PLASMA: "amber",
  PLATELET: "orange",
  WHOLE_BLOOD: "crimson",
  OTHER: "neutral",
};
