import Link from "next/link";
import { Compass, Home, SearchX } from "lucide-react";
import { getDictionary } from "@/i18n";
import { buttonClasses } from "@/packages/ui";

export const metadata = { robots: { index: false, follow: false } };

export default function NotFoundPage() {
  const d = getDictionary();
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <span
        aria-hidden
        className="inline-flex size-16 items-center justify-center rounded-full bg-teal-50 text-teal-600"
      >
        <SearchX className="size-8" />
      </span>
      <p aria-hidden className="mt-4 font-display text-5xl font-semibold text-ink">
        404
      </p>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">{d.common.notFoundTitle}</h1>
      <p className="mt-3 leading-relaxed text-ink-soft">{d.common.notFoundBody}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={buttonClasses("primary", "md")}>
          <Home className="size-4" aria-hidden />
          {d.common.backHome}
        </Link>
        <Link href="/how-it-works" className={buttonClasses("secondary", "md")}>
          <Compass className="size-4" aria-hidden />
          {d.nav.howItWorks}
        </Link>
      </div>
    </main>
  );
}
