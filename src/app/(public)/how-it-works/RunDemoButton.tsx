"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Play, CheckCircle2 } from "lucide-react";
import { getDictionary, translate, DEFAULT_LOCALE } from "@/i18n";
import type { DemoJourneyResult } from "@/lib/services/demo-journey";
import { Alert, Badge, buttonClasses, Spinner, Timeline } from "@/packages/ui";
import { runDemoJourneyAction } from "./actions";

interface DemoState {
  ok: boolean;
  message?: string;
  linkCode?: string;
  din?: string;
  events?: Array<{ labelKey: string; at: Date }>;
}

export function RunDemoButton({ demoMode }: { demoMode: boolean }) {
  const d = getDictionary();
  const [result, setResult] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const res: DemoJourneyResult = await runDemoJourneyAction();
        if (res.ok) {
          setResult(res);
        } else if (res.message === "RATE_LIMITED") {
          setError(d.public.demoRateLimited);
        } else {
          setError(res.message ?? d.common.errorGeneric);
        }
      } catch {
        setError(d.common.errorGeneric);
      }
    });
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={run}
        disabled={pending || !demoMode}
        className={buttonClasses("primary", "lg")}
      >
        {pending ? (
          <>
            <Spinner label={d.public.demoRunning} className="size-4" />
            {d.public.demoRunning}
          </>
        ) : (
          <>
            <Play className="size-4" aria-hidden />
            {d.public.demoRunButton}
          </>
        )}
      </button>

      {!demoMode ? <Alert type="info">{d.public.demoDisabledNote}</Alert> : null}
      {error ? <Alert type="error">{error}</Alert> : null}

      {result?.ok && result.events ? (
        <div className="space-y-5 rounded-xl border border-teal-600/20 bg-teal-50/50 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-teal-800">
            <CheckCircle2 className="size-4" aria-hidden />
            {d.public.demoDoneTitle}
          </p>
          <Timeline
            items={result.events.map((e) => ({
              title: translate(DEFAULT_LOCALE, e.labelKey),
            }))}
          />
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-ink-soft">{d.public.demoDoneBody}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="teal">{d.public.demoLinkCodeLabel}</Badge>
              <code className="rounded-lg border border-ink/10 bg-white px-3 py-1.5 font-mono text-sm text-ink">
                {result.linkCode}
              </code>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
              <li>{d.public.demoStepRegister}</li>
              <li>{d.public.demoStepLink}</li>
              <li>{d.public.demoStepView}</li>
            </ol>
            <Link href="/register" className={buttonClasses("primary", "md")}>
              {d.common.signUp}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
