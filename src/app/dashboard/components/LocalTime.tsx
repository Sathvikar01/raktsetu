"use client";

/**
 * Donor-side time rendering in the visitor's local timezone.
 * Renders an ISO string on the server (deterministic, day-granularity safe)
 * and upgrades to the local format after hydration.
 */
import { useEffect, useState } from "react";

function format(iso: string, withTime: boolean): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

export function LocalDate({ date }: { date: Date | string }) {
  const iso = typeof date === "string" ? date : date.toISOString();
  const [text, setText] = useState(() => iso.slice(0, 10));
  useEffect(() => setText(format(iso, false)), [iso]);
  return <time dateTime={iso.slice(0, 10)}>{text}</time>;
}

/**
 * Renders a translated template containing a literal "{DATE}" token, replacing
 * the token with the locally formatted date (word-order safe).
 */
export function LocalTemplate({ template, date }: { template: string; date: Date | string }) {
  const iso = typeof date === "string" ? date : date.toISOString();
  const [text, setText] = useState(() => template.replace("{DATE}", iso.slice(0, 10)));
  useEffect(() => setText(template.replace("{DATE}", format(iso, false))), [template, iso]);
  return <time dateTime={iso.slice(0, 10)}>{text}</time>;
}

export function LocalDateTime({ date }: { date: Date | string }) {
  const iso = typeof date === "string" ? date : date.toISOString();
  const [text, setText] = useState(() => iso.replace("T", " ").slice(0, 16));
  useEffect(() => setText(format(iso, true)), [iso]);
  return <time dateTime={iso}>{text}</time>;
}
