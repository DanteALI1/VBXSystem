import { expect, test } from "@playwright/test";

/**
 * TC-003 / TC-004 smoke — catalog list + detail navigation.
 * Requires seeded DB and running app (see playwright.config).
 */
test.describe("vulnerabilities catalog", () => {
  test("list shows title, count, search, and table", async ({ page }) => {
    await page.goto("/app/vulnerabilities");
    await expect(page.getByRole("heading", { name: "Vulnerabilities" })).toBeVisible();
    await expect(page.getByTestId("vuln-count")).toContainText("vulnerabilities found");
    await expect(page.getByTestId("vuln-search")).toBeVisible();
    await expect(page.getByTestId("facet-filters")).toBeVisible();
  });

  test("advanced query too complex surfaces error", async ({ page }) => {
    await page.goto("/app/vulnerabilities");
    await page.getByRole("button", { name: "Advanced query" }).click();
    await page.getByTestId("vuln-search").fill(
      "cve:CVE-1 AND severity:high AND kev:true AND epss:>0.1 AND source:nvd AND vendor:x",
    );
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByTestId("search-error")).toBeVisible({ timeout: 10000 });
  });

  test("row click opens detail sections", async ({ page }) => {
    await page.goto("/app/vulnerabilities");
    const row = page.getByTestId("vuln-row").first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click();
    await expect(page.getByTestId("vuln-detail-header")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scoring" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Related Findings" })).toBeVisible();
  });
});
