import { test, expect } from "@playwright/test";

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
        body: JSON.stringify({ username: user, password: pass, device_label: "e2e" }),
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

test.describe("W4 dashboard / cveql", () => {
  test("dashboard loads KPIs; CVEQL example runs", async ({ page }) => {
    await loginViaApi(page);

    await page.goto(`${BASE}/dashboard`);
    await expect(page.getByTestId("dashboard-page")).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.goto(`${BASE}/cveql`);
    await expect(page.getByTestId("cveql-page")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Критические CVE" }).click();
    await expect(page.getByTestId("cveql-results")).toBeVisible({ timeout: 15000 });
  });
});
