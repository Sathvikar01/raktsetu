import type { HTMLAttributes } from "react";

export interface SectionHeadingProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  kicker?: string;
  body?: string;
  align?: "left" | "center";
  headingLevel?: "h1" | "h2";
}

const HeadingTag = {
  h1: "h1",
  h2: "h2",
} as const;

export function SectionHeading({
  title,
  kicker,
  body,
  align = "center",
  headingLevel = "h2",
  className,
  ...rest
}: SectionHeadingProps) {
  const Tag = HeadingTag[headingLevel];
  return (
    <div
      className={`${align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"} ${className ?? ""}`}
      {...rest}
    >
      {kicker ? (
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">{kicker}</p>
      ) : null}
      <Tag
        className={`mt-2 font-display font-semibold tracking-tight text-ink ${
          headingLevel === "h1" ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"
        }`}
      >
        {title}
      </Tag>
      {body ? <p className="mt-3 text-base leading-relaxed text-ink-soft">{body}</p> : null}
    </div>
  );
}
