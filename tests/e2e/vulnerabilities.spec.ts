import { expect, test, type Page } from "@playwright/test";

/**
 * TC-003 / TC-004 smoke — catalog list + detail navigation.
 * Requires seeded DB, running app, and authenticated session.
 */

const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@local.dev";
const ADMIN_PASSWORD =
  process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ChangeMe123!";

async function loginAsAdmin(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByTestId("login-email").fill(ADMIN_EMAIL);
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
}

test.describe("vulnerabilities catalog", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

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
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.getByTestId("vuln-detail-header")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scoring" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Related Findings" })).toBeVisible();
  });
});
