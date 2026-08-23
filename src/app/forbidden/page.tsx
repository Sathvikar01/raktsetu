import type { Metadata } from "next";
import Link from "next/link";
import { Home, ShieldX } from "lucide-react";
import { getDictionary } from "@/i18n";
import { buttonClasses } from "@/packages/ui";

export function generateMetadata(): Metadata {
  const d = getDictionary();
  return { title: d.common.forbiddenTitle };
}

export default function ForbiddenPage() {
  const d = getDictionary();
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-full bg-crimson-50 text-crimson-600">
        <ShieldX className="size-8" aria-hidden />
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink">{d.common.forbiddenTitle}</h1>
      <p className="mt-3 leading-relaxed text-ink-soft">{d.common.forbiddenBody}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/login" className={buttonClasses("primary", "md")}>
          {d.common.signIn}
        </Link>
        <Link href="/" className={buttonClasses("secondary", "md")}>
          <Home className="size-4" aria-hidden />
          {d.common.backHome}
        </Link>
      </div>
    </main>
  );
}
