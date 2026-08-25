"use server";

import { runDemoJourney, type DemoJourneyResult } from "@/lib/services/demo-journey";

export async function runDemoJourneyAction(): Promise<DemoJourneyResult> {
  return runDemoJourney();
}
