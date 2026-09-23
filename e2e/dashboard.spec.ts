import { test, expect } from "@playwright/test";

const BASE = process.env.VBX_E2E_BASE_URL || "http://127.0.0.1:80";
const USER = process.env.VBX_E2E_USER || "admin";
const PASS = process.env.VBX_E2E_PASSWORD || "ChangeMe_StrongPass_123!";

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Логин или email").fill(USER);
  await page.getByLabel("Пароль").fill(PASS);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 }),
    page.getByRole("button", { name: /войти/i }).click(),
  ]);
}

test.describe("W4 dashboard / cveql", () => {
  test("dashboard loads KPIs; CVEQL example runs", async ({ page }) => {
    await login(page);

    await page.goto(`${BASE}/dashboard`);
    await expect(page.getByTestId("dashboard-page")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.goto(`${BASE}/cveql`);
    await expect(page.getByTestId("cveql-page")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Критические CVE" }).click();
    await expect(page.getByTestId("cveql-results")).toBeVisible({ timeout: 15000 });
  });
});
