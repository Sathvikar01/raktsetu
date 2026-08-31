import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-60 focus-visible:shadow-lift active:translate-y-px";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-teal-600 text-white shadow-card hover:bg-teal-700 hover:shadow-lift active:bg-teal-700",
  secondary:
    "border border-teal-600/30 bg-white text-teal-700 shadow-card hover:border-teal-600/60 hover:bg-teal-50 hover:shadow-lift",
  ghost: "text-teal-700 hover:bg-teal-50",
  danger:
    "bg-crimson-600 text-white shadow-card hover:bg-crimson-700 hover:shadow-lift active:bg-crimson-700",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = ""
): string {
  return [BASE, VARIANTS[variant], SIZES[size], className].filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      {...rest}
    />
  );
});
