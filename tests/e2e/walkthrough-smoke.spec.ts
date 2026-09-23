import { expect, test } from "@playwright/test";

/**
 * TC-017 — light walkthrough smoke: key app pages load for an authenticated admin.
 * Full PNG evidence remains `npm run test:screenshots` (setup-walkthrough frames).
 */
test.describe("TC-017 screenshot walkthrough smoke", () => {
  test("login → dashboard → vulns → scans → findings load", async ({
    page,
  }) => {
    // storageState from chromium project already authenticates as admin.
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Vulnerabilities").first()).toBeVisible();
    await expect(page.getByText("Open findings").first()).toBeVisible();

    await page.getByRole("link", { name: "Vulnerabilities", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/vulnerabilities/);
    await expect(
      page.getByRole("heading", { name: /vulnerabilit/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("vuln-table")).toBeVisible();

    await page.getByRole("link", { name: "Scans", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/scans/);
    await expect(page.getByRole("heading", { name: /^scans$/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("scans-table")).toBeVisible();

    await page.getByRole("link", { name: "Findings", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/findings/);
    await expect(page.getByRole("heading", { name: /^findings$/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("findings-table")).toBeVisible();

    // Assets also in the nav walkthrough path
    await page.getByRole("link", { name: "Assets", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/assets/);
    await expect(page.getByRole("heading", { name: /^assets$/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
