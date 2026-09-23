/**
 * Capture setup walkthrough screenshots (Playwright).
 * Requires: app on APP_URL, seeded DB, bootstrap admin.
 */
import { chromium, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const OUT = path.join(process.cwd(), "docs/setup-walkthrough/images");
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@local.dev";
const PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ChangeMe123!";
const WAVE = process.env.SCREENSHOT_WAVE ?? "1";

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", name);
}

async function login(page: Page) {
  await page.goto(`${APP_URL}/login`);
  await page.getByTestId("login-email").fill(EMAIL);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/app/, { timeout: 20_000 });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  if (WAVE === "0" || WAVE === "all") {
    // A1 handled separately when compose healthy
  }

  if (WAVE === "1" || WAVE === "all") {
    await page.goto(`${APP_URL}/login`);
    await shot(page, "02-login.png"); // A2
    await shot(page, "03-login-form.png"); // B1

    await login(page);
    await shot(page, "04-dashboard.png"); // B2
    await shot(page, "19-app-shell.png"); // F2

    await page.goto(`${APP_URL}/app/vulnerabilities`);
    await page.waitForSelector('[data-testid="vuln-count"]', { timeout: 15_000 });
    await page.waitForSelector('[data-testid="vuln-row"]', { timeout: 20_000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="vuln-count"]');
      return el && !el.textContent?.startsWith("0 ");
    });
    await shot(page, "08-vulns-table.png"); // C3

    await page.getByTestId("vuln-row").first().click();
    await page.waitForSelector('[data-testid="vuln-detail-header"]', {
      timeout: 15_000,
    });
    await shot(page, "09-vuln-detail.png"); // C4

    await page.goto(`${APP_URL}/app/vulnerabilities`);
    await page.waitForSelector('[data-testid="vuln-row"]', { timeout: 20_000 });
    await page.getByRole("button", { name: "Advanced query" }).click();
    await page.getByRole("button", { name: "Query Builder" }).click();
    await page.getByRole("button", { name: "Saved views" }).click();
    await page.waitForTimeout(400);
    await shot(page, "10-search-views.png"); // C5
  }

  await browser.close();
  console.log("screenshots done wave", WAVE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
