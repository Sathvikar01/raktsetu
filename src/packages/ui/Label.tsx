import { forwardRef, type LabelHTMLAttributes } from "react";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...rest }, ref) {
    return <label ref={ref} className={`rs-label ${className ?? ""}`} {...rest} />;
  }
);
