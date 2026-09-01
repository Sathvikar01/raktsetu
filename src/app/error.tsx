"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { getDictionary } from "@/i18n";
import { Alert, buttonClasses } from "@/packages/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const d = getDictionary();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <span
        aria-hidden
        className="inline-flex size-16 items-center justify-center rounded-full bg-teal-50 text-teal-600"
      >
        <AlertTriangle className="size-8" />
      </span>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">{d.common.errorTitle}</h1>
      <p className="mt-3 leading-relaxed text-ink-soft">{d.common.errorBody}</p>
      <div className="mt-6 w-full">
        <Alert type="info">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{d.common.errorDigest}</span>
            <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs">
              {error.digest ?? "—"}
            </code>
          </span>
        </Alert>
      </div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={reset} className={buttonClasses("primary", "md")}>
          <RotateCcw className="size-4" aria-hidden />
          {d.common.retry}
        </button>
        <Link href="/" className={buttonClasses("secondary", "md")}>
          {d.common.backHome}
        </Link>
      </div>
    </main>
  );
}
