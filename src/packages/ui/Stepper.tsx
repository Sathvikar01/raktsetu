import { Check } from "lucide-react";

export interface StepperStep {
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Index of the current step; steps before it render complete. */
  current?: number;
  ariaLabel: string;
}

export function Stepper({ steps, current = 0, ariaLabel }: StepperProps) {
  return (
    <ol aria-label={ariaLabel} className="flex w-full items-start">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={step.label}
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 flex-1 flex-col items-center"
          >
            <div aria-hidden className="flex w-full items-center">
              <span
                className={`h-0.5 flex-1 rounded ${i === 0 ? "bg-transparent" : done ? "bg-teal-500" : "bg-ink/15"}`}
              />
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? "bg-teal-500 text-white"
                    : active
                      ? "border-2 border-teal-500 bg-white text-teal-700"
                      : "border border-ink/20 bg-white text-ink-faint"
                }`}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span
                className={`h-0.5 flex-1 rounded ${i === steps.length - 1 ? "bg-transparent" : i < current ? "bg-teal-500" : "bg-ink/15"}`}
              />
            </div>
            <span
              className={`mt-2 max-w-full truncate px-1 text-center text-[11px] font-medium sm:text-xs ${
                active ? "text-teal-700" : done ? "text-ink" : "text-ink-faint"
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
