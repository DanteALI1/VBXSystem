import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, loginAsAdmin } from "../helpers/auth";

test.describe("TC-001 login success/fail", () => {
  test("wrong password stays on login with error", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-email").fill(ADMIN_EMAIL);
    await page.getByTestId("login-password").fill("DefinitelyWrongPassword!");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin credentials redirect to /app dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/app(\/|$|\?)/);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("unauthenticated /app redirects to /login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("login-form")).toBeVisible();
  });
});
