import { expect, type Page } from "@playwright/test";

export const ADMIN_EMAIL =
  process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@local.dev";
export const ADMIN_PASSWORD =
  process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ChangeMe123!";

/**
 * Sign in via the login form and wait for the app dashboard.
 * Retries when Better Auth production rate-limit (3 / 10s on /sign-in) trips.
 */
export async function loginAsAdmin(page: Page) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.goto("/login");
    await page.getByTestId("login-email").fill(ADMIN_EMAIL);
    await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();

    const outcome = await Promise.race([
      page
        .waitForURL(/\/app(\/|$|\?)/, { timeout: 12_000 })
        .then(() => "ok" as const),
      page
        .getByTestId("login-error")
        .waitFor({ state: "visible", timeout: 12_000 })
        .then(async () => {
          const text = (await page.getByTestId("login-error").textContent()) ?? "";
          return /too many requests/i.test(text) ? ("rate" as const) : ("fail" as const);
        }),
    ]).catch(() => "timeout" as const);

    if (outcome === "ok") {
      await expect(page).toHaveURL(/\/app(\/|$|\?)/);
      return;
    }

    if (outcome === "rate" && attempt < maxAttempts) {
      // Better Auth special rule: /sign-in window = 10s
      await page.waitForTimeout(11_000);
      continue;
    }

    throw new Error(
      `loginAsAdmin failed (attempt ${attempt}/${maxAttempts}): ${outcome}`,
    );
  }
}
