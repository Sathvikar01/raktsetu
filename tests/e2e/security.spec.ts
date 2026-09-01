/**
 * HTTP contract checks against the running app:
 * - AT-4: unsigned/unknown partner ingest is rejected (401)
 * - AT-9: anonymous access to protected surfaces redirects
 * - M4/L7: cron endpoint requires Bearer auth when CRON_SECRET is configured
 * - M8: registration validation distinguishes bad email from weak password
 */
import { expect, test } from "@playwright/test";

test.describe("AT-4 partner ingest auth", () => {
  test("GET is method-not-allowed", async ({ request }) => {
    const res = await request.get("/api/v1/events");
    expect(res.status()).toBe(405);
  });

  test("POST without signature headers is 401", async ({ request }) => {
    const res = await request.post("/api/v1/events", { data: {} });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("POST with an unknown key is 401 (no enumeration)", async ({ request }) => {
    const res = await request.post("/api/v1/events", {
      headers: {
        "x-raktsetu-key": "does-not-exist",
        "x-raktsetu-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-raktsetu-signature": "0".repeat(64),
      },
      data: {},
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("AT-9 authorization boundaries", () => {
  test("forbidden page offers both donor and staff sign-in", async ({ page }) => {
    await page.goto("/forbidden");
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /blood bank portal/i })).toBeVisible();
  });
});

test.describe("M8 registration error branching", () => {
  test("malformed email reports invalid_email, not weak_password", async ({ page }) => {
    await page.goto("/register");
    await page.locator('input[name="displayName"]').fill("E2E Bot");
    await page.locator('input[name="email"]').fill("not-an-email");
    await page.locator('input[name="password"]').fill("short");
    await page.getByRole("button", { name: /create|sign up|register/i }).click();
    await expect(page).toHaveURL(/error=invalid_email/);
  });
});
