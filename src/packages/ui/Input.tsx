import { forwardRef, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={`rs-input ${error ? "border-crimson-500 focus:border-crimson-500 focus:ring-crimson-500/20" : ""} ${className ?? ""}`}
      {...rest}
    />
  );
});
