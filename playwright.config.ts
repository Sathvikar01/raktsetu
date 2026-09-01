import { defineConfig, devices } from "@playwright/test";

/**
 * Browser/HTTP E2E for the AT-1..AT-13 acceptance contract (M7).
 * Requires a running app: `npm run dev` (or `npm start`) with a seeded DB.
 *
 *   npm run e2e            # headless
 *   npx playwright test tests/e2e/auth.spec.ts
 *
 * First-time setup: npm i -D @playwright/test && npx playwright install chromium
 * The app server is NOT auto-started (it needs a real database + seed); point
 * E2E_BASE_URL at any instance, or set START_APP=1 to launch `next dev`.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(process.env.START_APP
    ? {
        webServer: {
          command: "npm run dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
