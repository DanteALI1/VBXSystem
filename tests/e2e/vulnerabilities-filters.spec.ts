import { expect, test } from "@playwright/test";

async function selectFilter(
  page: import("@playwright/test").Page,
  triggerTestId: string,
  optionText: string | RegExp,
) {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole("option", { name: optionText }).click();
}

test.describe("TC-003 vulnerabilities filters/search", () => {
  test("search by CVE id filters results", async ({ page }) => {
    await page.goto("/app/vulnerabilities");
    await expect(page.getByTestId("vuln-table")).toBeVisible();

    await page.getByTestId("vuln-search").fill("CVE-2021-44228");
    await expect(page).toHaveURL(/q=CVE-2021-44228/, { timeout: 10_000 });

    const rows = page.getByTestId("vuln-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("CVE-2021-44228");
    await expect(page.getByTestId("vuln-results-summary")).toContainText(
      "of 1",
    );
  });

  test("filter by severity critical shows critical items", async ({
    page,
  }) => {
    await page.goto("/app/vulnerabilities");
    await expect(page.getByTestId("vuln-filters")).toBeVisible();

    await selectFilter(page, "vuln-severity-filter", /^critical$/i);
    await expect(page).toHaveURL(/severity=critical/, { timeout: 10_000 });

    const rows = page.getByTestId("vuln-row");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(/critical/i);
    }
  });

  test("filter by source nvd and bdu", async ({ page }) => {
    await page.goto("/app/vulnerabilities");

    await selectFilter(page, "vuln-source-filter", /^nvd$/i);
    await expect(page).toHaveURL(/source=nvd/, { timeout: 10_000 });
    await expect(page.getByTestId("vuln-row").first()).toBeVisible();
    await expect(page.getByTestId("vuln-row").first()).toContainText(/nvd/i);

    await selectFilter(page, "vuln-source-filter", /^bdu$/i);
    await expect(page).toHaveURL(/source=bdu/, { timeout: 10_000 });
    await expect(page.getByTestId("vuln-row").first()).toBeVisible();
    await expect(page.getByTestId("vuln-row").first()).toContainText(/bdu/i);
  });
});
