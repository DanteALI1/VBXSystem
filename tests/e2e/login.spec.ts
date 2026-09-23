import { expect, test, type Page } from "@playwright/test";

/**
 * TC-001 — Login success/fail.
 * Skips when the app server is not reachable (local/CI without stack).
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@local.dev";
const ADMIN_PASSWORD =
  process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ChangeMe123!";

async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(APP_URL, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

async function clearSession(page: Page) {
  await page.context().clearCookies();
}

test.describe("TC-001 login", () => {
  test.beforeAll(async () => {
    const up = await serverReachable();
    test.skip(!up, `App not reachable at ${APP_URL} — skip TC-001`);
  });

  test("shows VBX login form", async ({ page }) => {
    await clearSession(page);
    await page.goto("/login");
    await expect(page.getByText("VBX", { exact: true })).toBeVisible();
    await expect(page.getByTestId("login-email")).toBeVisible();
    await expect(page.getByTestId("login-password")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  test("rejects invalid credentials", async ({ page }) => {
    await clearSession(page);
    await page.goto("/login");
    await page.getByTestId("login-email").fill("nobody@example.invalid");
    await page.getByTestId("login-password").fill("wrong-password-xx");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("accepts bootstrap admin and redirects to /app", async ({ page }) => {
    await clearSession(page);
    await page.goto("/login");
    await page.getByTestId("login-email").fill(ADMIN_EMAIL);
    await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
    await expect(page.getByTestId("session-email")).toContainText(ADMIN_EMAIL);
    await expect(page.getByTestId("session-role")).toHaveText(/admin/i);
  });

  test("logout clears session; /app redirects to login", async ({ page }) => {
    await clearSession(page);
    await page.goto("/login");
    await page.getByTestId("login-email").fill(ADMIN_EMAIL);
    await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });

    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });
});
