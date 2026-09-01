/**
 * AT-1 Donor authentication + M5 middleware contract (browser level).
 * Requires a seeded database: donor demo@raktsetu.example / demo-password-123
 * (adjust E2E_DONOR_EMAIL / E2E_DONOR_PASSWORD to your seed).
 */
import { expect, test } from "@playwright/test";

const donorEmail = process.env.E2E_DONOR_EMAIL ?? "donor@demo.raktsetu";
const donorPassword = process.env.E2E_DONOR_PASSWORD ?? "donor-demo-password";

test.describe("AT-1 donor auth", () => {
  test("login page renders and links to registration", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading")).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("invalid credentials keep the user on /login with an error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(donorEmail);
    await page.locator('input[name="password"]').fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test("dashboard is unreachable without a session (middleware → /login?next=)", async ({ page }) => {
    await page.goto("/dashboard/settings");
    expect(new URL(page.url()).pathname).toBe("/login");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/dashboard/settings");
  });

  test("staff portal redirects anonymous users to the partner login", async ({ page }) => {
    await page.goto("/staff");
    expect(new URL(page.url()).pathname).toBe("/partner/login");
  });

  test("successful donor login lands on the requested ?next= path", async ({ page }) => {
    await page.goto("/dashboard/notifications"); // middleware captures next
    await page.locator('input[name="email"]').fill(donorEmail);
    await page.locator('input[name="password"]').fill(donorPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/notifications/);
  });
});
