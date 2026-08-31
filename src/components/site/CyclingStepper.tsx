"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Stepper as StepperBase, type StepperProps } from "@/packages/ui";

/**
 * Landing-page demo stepper: slowly cycles through the journey so the
 * progress feels alive. Static everywhere else via the base component.
 */
export function CyclingStepper({ steps, ariaLabel, intervalMs = 2600 }: Omit<StepperProps, "current"> & { intervalMs?: number }) {
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      setCurrent((c) => (c + 1) % (steps.length + 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [reduce, steps.length, intervalMs]);

  return <StepperBase steps={steps} current={current} ariaLabel={ariaLabel} />;
}
