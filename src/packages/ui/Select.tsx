import { forwardRef, type SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error, className, children, ...rest },
  ref
) {
  return (
    <select
      ref={ref}
      aria-invalid={error || undefined}
      className={`rs-input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%234b5563%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat pr-9 ${error ? "border-crimson-500 focus:border-crimson-500 focus:ring-crimson-500/20" : ""} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </select>
  );
});
