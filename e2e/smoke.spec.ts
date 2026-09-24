import { test, expect } from "@playwright/test";

/**
 * W8 consolidated smoke: login → search → CVE detail → ticket → admin database page.
 */
const BASE = process.env.VBX_E2E_BASE_URL || "http://127.0.0.1:80";
const USER = process.env.VBX_E2E_USER || "admin";
const PASS = process.env.VBX_E2E_PASSWORD || "ChangeMe_StrongPass_123!";

async function loginViaApi(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/login`);
  const ok = await page.evaluate(
    async ({ user, pass }) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass, device_label: "e2e-smoke" }),
      });
      const d = await r.json();
      if (!r.ok || !d.access_token) return false;
      localStorage.setItem("vbx_access_token", d.access_token);
      if (d.refresh_token) localStorage.setItem("vbx_refresh_token", d.refresh_token);
      return true;
    },
    { user: USER, pass: PASS },
  );
  expect(ok).toBeTruthy();
}

test.describe("W8 smoke", () => {
  test("login → search → CVE → ticket → database settings", async ({ page }) => {
    await loginViaApi(page);

    await page.goto(`${BASE}/search`);
    await expect(page.getByRole("heading", { name: /Security Vulnerability Database|Search/i })).toBeVisible({ timeout: 15000 });
    await page.getByLabel("Поисковый запрос").fill("CVE-2024");
    await page.getByRole("button", { name: "Найти" }).click();
    const hit = page.getByTestId("hit-CVE-2024-0001");
    await expect(hit).toBeVisible({ timeout: 20000 });
    await hit.click();
    await expect(page.getByTestId("cve-detail")).toBeVisible({ timeout: 15000 });

    await page.goto(`${BASE}/tickets?cve=CVE-2024-0001`);
    await expect(page.getByTestId("tickets-page")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("ticket-create-form")).toBeVisible();
    await page.getByRole("button", { name: "Создать заявку" }).click();
    await expect(page.getByTestId("ticket-detail")).toBeVisible({ timeout: 15000 });

    await page.goto(`${BASE}/settings/database`);
    await expect(page.getByTestId("settings-database")).toBeVisible({ timeout: 20000 });
  });
});
