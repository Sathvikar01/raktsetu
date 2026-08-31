import Link from "next/link";
import { Droplets } from "lucide-react";
import { getDictionary } from "@/i18n";

export function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const d = getDictionary();
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link
          href="/"
          className="mx-auto flex items-center gap-2 rounded-lg font-bold tracking-tight text-ink"
          aria-label={d.common.brandHome}
        >
          <Droplets className="size-7 text-crimson-600" aria-hidden />
          <span className="text-xl">{d.common.appName}</span>
        </Link>
        <div className="rs-card rs-reveal mt-8 p-6 sm:p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-ink-soft">{footer}</div> : null}
      </div>
    </div>
  );
}
