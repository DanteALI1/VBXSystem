import { test, expect } from "@playwright/test";

const BASE = process.env.VBX_E2E_BASE_URL || "http://127.0.0.1:80";
const USER = process.env.VBX_E2E_USER || "admin";
const PASS = process.env.VBX_E2E_PASSWORD || "ChangeMe_StrongPass_123!";

test.describe("W3 search → detail", () => {
  test("login, search, open CVE detail with BDU panel", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Логин или email").fill(USER);
    await page.getByLabel("Пароль").fill(PASS);

    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 }),
      page.getByRole("button", { name: /войти/i }).click(),
    ]);

    await expect.poll(async () => page.evaluate(() => localStorage.getItem("vbx_access_token"))).toBeTruthy();

    await page.goto(`${BASE}/search`);
    await expect(page.getByRole("heading", { name: /Security Vulnerability Database|Search/i })).toBeVisible({ timeout: 15000 });
    await page.getByLabel("Поисковый запрос").fill("CVE-2024");
    await page.getByRole("button", { name: "Найти" }).click();

    const hit = page.getByTestId("hit-CVE-2024-0001");
    await expect(hit).toBeVisible({ timeout: 20000 });
    await hit.click();
    await expect(page.getByTestId("cve-detail")).toBeVisible();
    await expect(page.getByTestId("bdu-panel")).toBeVisible();
  });
});
