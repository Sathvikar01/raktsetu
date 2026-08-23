import type { HTMLAttributes } from "react";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rs-card ${className ?? ""}`} {...rest} />;
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-b border-ink/5 px-6 py-4 ${className ?? ""}`} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`text-lg font-semibold tracking-tight text-ink ${className ?? ""}`} {...rest} />;
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-6 py-5 ${className ?? ""}`} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border-t border-ink/5 px-6 py-4 text-sm text-ink-soft ${className ?? ""}`}
      {...rest}
    />
  );
}
