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

test.describe("W5 XDB", () => {
  test("import sample and open CVE from table", async ({ page }) => {
    await loginViaApi(page);
    await page.goto(`${BASE}/xdb`);
    await expect(page.getByTestId("xdb-page")).toBeVisible({ timeout: 20000 });

    // Wait until auth/RBAC finishes — Sample button only for vuln:sync
    const sampleBtn = page.getByRole("button", { name: /^Sample dataset$/i });
    await expect(sampleBtn).toBeVisible({ timeout: 20000 });

    // Table may already have demo seed; import is idempotent
    const existing = page.getByTestId("xdb-XDB-2024-0001");
    if (!(await existing.isVisible().catch(() => false))) {
      await sampleBtn.click();
      await expect(existing).toBeVisible({ timeout: 15000 });
    }

    await page.getByRole("link", { name: "CVE-2024-0001" }).first().click();
    await expect(page.getByTestId("cve-detail")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("exploits-panel")).toBeVisible();
  });
});
