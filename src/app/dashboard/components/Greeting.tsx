"use client";

import { useEffect, useState } from "react";
import { getDictionary, translate, DEFAULT_LOCALE } from "@/i18n";

/** Time-of-day greeting rendered from the visitor's own clock/timezone. */
export function Greeting({ displayName }: { displayName: string }) {
  const d = getDictionary();
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    const key =
      hour < 12 ? "greetingMorning" : hour < 17 ? "greetingAfternoon" : "greetingEvening";
    setGreeting(translate(DEFAULT_LOCALE, `donor.${key}`, { name: displayName }));
  }, [displayName]);

  return (
    <h1 aria-live="polite" className="text-xl font-bold tracking-tight text-ink">
      {greeting ?? `${d.common.appName} · ${displayName}`}
    </h1>
  );
}
