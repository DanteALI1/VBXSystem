/**
 * Capture fresh UI gallery screenshots for README.
 * Usage: npx playwright test e2e/capture-gallery.spec.ts --reporter=line
 */
import { test, expect, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE = process.env.VBX_E2E_BASE_URL || "http://127.0.0.1:80";
const USER = process.env.VBX_E2E_USER || "admin";
const PASS = process.env.VBX_E2E_PASSWORD || "ChangeMe_StrongPass_123!";
const OUT = path.resolve("docs/screenshots");

async function loginViaApi(page: Page) {
  await page.goto(`${BASE}/login`);
  const ok = await page.evaluate(
    async ({ user, pass }) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass, device_label: "gallery" }),
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

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(450);
  await page.screenshot({
    path: path.join(OUT, name),
    fullPage: false,
    animations: "disabled",
  });
}

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test("capture UI gallery", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`${BASE}/login`);
  await expect(page.locator('input[type="password"], input[name="password"]').first()).toBeVisible({
    timeout: 20000,
  });
  await shot(page, "01_login.png");

  await page.goto(`${BASE}/register`);
  await page.waitForTimeout(600);
  await shot(page, "02_register.png");

  await loginViaApi(page);

  await page.goto(`${BASE}/dashboard`);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 20000 });
  await shot(page, "03_dashboard.png");

  const collapse = page.getByRole("button", { name: "Свернуть меню" });
  if (await collapse.isVisible()) {
    await collapse.click();
    await page.waitForTimeout(400);
    await shot(page, "03b_dashboard_sidebar_collapsed.png");
    await page.getByRole("button", { name: "Развернуть меню" }).click();
    await page.waitForTimeout(400);
  }

  await page.goto(`${BASE}/search`);
  await expect(page.getByRole("heading", { name: /Security Vulnerability Database/i })).toBeVisible({
    timeout: 20000,
  });
  await shot(page, "04_search.png");

  await page.goto(`${BASE}/vuln/CVE-2024-0001`);
  await expect(page.getByText("CVE-2024-0001").first()).toBeVisible({ timeout: 20000 });
  await shot(page, "05_cve_detail.png");

  const scoring = page.getByText(/Vulnerability Scoring|Scoring Details|CVSS/i).first();
  if (await scoring.isVisible().catch(() => false)) {
    await scoring.scrollIntoViewIfNeeded();
  }
  await shot(page, "05b_cve_scoring_details.png");

  const bduTab = page.getByRole("tab", { name: /БДУ|BDU/i }).or(page.getByRole("button", { name: /^БДУ$|^BDU$/i }));
  if (await bduTab.first().isVisible().catch(() => false)) {
    await bduTab.first().click();
    await page.waitForTimeout(500);
  }
  await shot(page, "05c_cve_bdu_tab.png");

  await page.goto(`${BASE}/bdu/${encodeURIComponent("BDU:2024-00001")}`);
  await page.waitForTimeout(800);
  await shot(page, "06_bdu_detail.png");

  await page.goto(`${BASE}/cveql`);
  await page.waitForTimeout(700);
  await shot(page, "07_cveql.png");

  await page.goto(`${BASE}/epss`);
  await page.waitForTimeout(700);
  await shot(page, "08_epss.png");

  await page.goto(`${BASE}/xdb`);
  await page.waitForTimeout(700);
  await shot(page, "09_xdb.png");

  // ---- Tickets detailed flow ----
  await page.goto(`${BASE}/tickets`);
  await expect(page.getByTestId("tickets-page")).toBeVisible({ timeout: 20000 });
  await shot(page, "10_tickets.png");

  await page.getByRole("button", { name: "Создать" }).click();
  await expect(page.getByTestId("ticket-create-form")).toBeVisible();
  await shot(page, "10a_ticket_create_empty.png");

  await page.getByLabel("Заголовок").fill("Проверка CVE-2024-0001 — Rapid Reset");
  await page.getByTestId("ticket-create-form").locator("textarea").fill(
    "Описание заявки:\n1) Подтвердить эксплуатацию в периметре\n2) Оценить затронутые сервисы\n3) Согласовать окно патча\n\nИсточник: NVD / KEV.",
  );
  await page.getByTestId("ticket-create-form").locator("select").first().selectOption("CRITICAL");
  await page.getByLabel("CVE / BDU").fill("CVE-2024-0001");
  await shot(page, "10b_ticket_create_filled.png");

  await page.getByRole("button", { name: "Создать заявку" }).click();
  await expect(page.getByTestId("ticket-detail")).toBeVisible({ timeout: 15000 });
  await shot(page, "10c_ticket_detail.png");

  await page.getByRole("button", { name: "→ in_progress" }).click();
  await expect(page.getByText("Статус → in_progress")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(400);
  await shot(page, "10d_ticket_status_in_progress.png");

  await page.getByPlaceholder("Комментарий…").fill(
    "Назначено аналитику. Ждём подтверждения от владельца сервиса.",
  );
  await page.getByRole("button", { name: "Отправить" }).click();
  await page.waitForTimeout(700);
  await shot(page, "10e_ticket_with_comment.png");

  await page.getByTestId("ticket-timeline").scrollIntoViewIfNeeded();
  await shot(page, "10f_ticket_timeline.png");

  await page.goto(`${BASE}/local/new`);
  await page.waitForTimeout(700);
  await shot(page, "20_local_new.png");

  await page.goto(`${BASE}/search`);
  await expect(page.getByRole("heading", { name: /Security Vulnerability Database/i })).toBeVisible({
    timeout: 20000,
  });
  const q = page.locator('input[type="search"], input[placeholder*="CVE"], input').first();
  // Prefer dedicated search input if labeled
  const searchInput = page.getByPlaceholder(/CVE|BDU|поиск|Search/i).first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill("BDU");
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(900);
  const localLink = page.locator('a[href*="/local/"]').first();
  if (await localLink.isVisible().catch(() => false)) {
    await localLink.click();
    await page.waitForTimeout(800);
    await shot(page, "20_local_detail.png");
  } else {
    await page.goto(`${BASE}/local/new`);
    await page.waitForTimeout(500);
    await shot(page, "20_local_detail.png");
  }

  const settings = [
    ["profile", "11_settings_profile.png"],
    ["users", "12_settings_users.png"],
    ["notifications", "13_settings_notifications.png"],
    ["security", "14_settings_security.png"],
    ["database", "15_settings_database.png"],
    ["integrations", "16_settings_integrations.png"],
    ["api-keys", "17_settings_api_keys.png"],
    ["branding", "18_settings_branding.png"],
    ["system", "19_settings_system.png"],
  ] as const;

  for (const [slug, file] of settings) {
    await page.goto(`${BASE}/settings/${slug}`);
    await page.waitForTimeout(750);
    await shot(page, file);
  }
});
