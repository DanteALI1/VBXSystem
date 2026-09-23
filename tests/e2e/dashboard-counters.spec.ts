import { expect, test } from "@playwright/test";

/**
 * TC-016 — UI smoke that dashboard counters render from GET /api/dashboard.
 * Authoritative SQL agreement is covered by integration/dashboard-counters.test.ts.
 */
test.describe("TC-016 dashboard counters (UI)", () => {
  test("dashboard shows counter cards matching API", async ({ page }) => {
    const apiPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/dashboard") &&
        res.request().method() === "GET" &&
        res.ok(),
    );

    await page.goto("/app");
    const apiRes = await apiPromise;
    const data = (await apiRes.json()) as {
      vulnerabilities: number;
      assets: number;
      findingsOpen: number;
    };

    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible({
      timeout: 10_000,
    });

    const section = page.locator("section").first();
    await expect(section.getByText("Vulnerabilities", { exact: true })).toBeVisible();
    await expect(section.getByText(String(data.vulnerabilities), { exact: true })).toBeVisible();
    await expect(section.getByText("Assets", { exact: true })).toBeVisible();
    await expect(section.getByText(String(data.assets), { exact: true })).toBeVisible();
    await expect(section.getByText("Open findings", { exact: true })).toBeVisible();
    await expect(
      section.getByText(String(data.findingsOpen), { exact: true }),
    ).toBeVisible();
  });
});
