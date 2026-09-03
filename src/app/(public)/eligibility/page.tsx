import type { Metadata } from "next";
import { getDictionary } from "@/i18n";
import { EligibilityChecker } from "./EligibilityChecker";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.eligibility.metaTitle, description: d.eligibility.metaDescription };
}

export default function EligibilityPage() {
  const d = getDictionary();
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          {d.eligibility.heroKicker}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {d.eligibility.heroTitle}
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-ink-soft">{d.eligibility.heroBody}</p>
      </section>
      <EligibilityChecker />
    </div>
  );
}
