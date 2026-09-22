/**
 * Wave 1 screenshot capture for setup walkthrough frames.
 *
 * Env:
 *   APP_URL                  (default http://localhost:3000)
 *   BOOTSTRAP_ADMIN_EMAIL    (default admin@local.dev)
 *   BOOTSTRAP_ADMIN_PASSWORD (default ChangeMe123!)
 *
 * Reuses playwright/.auth/admin.json when present to avoid Better Auth
 * /sign-in rate-limit (3 / 10s). Falls back to a single login with retries.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const ADMIN_EMAIL =
  process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@local.dev";
const ADMIN_PASSWORD =
  process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ChangeMe123!";

const VIEWPORT = { width: 1440, height: 900 } as const;
const OUT_DIR = path.join(
  process.cwd(),
  "docs/setup-walkthrough/images",
);
const AUTH_FILE = path.join(process.cwd(), "playwright/.auth/admin.json");

/** Seeded vuln with both CVE and BDU (see tests/e2e/vulnerability-detail.spec.ts). */
const BOTH_CVE_BDU_ID = "949dc591-2d25-47a6-a285-43f62e4cb598";

const MIN_BYTES = 10 * 1024;

type FrameSpec = {
  id: string;
  file: string;
  capture: (page: Page) => Promise<void>;
};

async function ensureOutDir() {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
}

async function shot(page: Page, file: string) {
  const dest = path.join(OUT_DIR, file);
  await page.screenshot({ path: dest, fullPage: false });
  const stat = await fs.promises.stat(dest);
  if (stat.size < MIN_BYTES) {
    throw new Error(
      `${file} is only ${stat.size} bytes (need >${MIN_BYTES})`,
    );
  }
  console.log(`  ✓ ${file} (${stat.size} bytes)`);
}

async function loginOnce(page: Page) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
    await page.getByTestId("login-email").fill(ADMIN_EMAIL);
    await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
    await page.getByTestId("login-submit").click();

    const outcome = await Promise.race([
      page
        .waitForURL(/\/app(\/|$|\?)/, { timeout: 12_000 })
        .then(() => "ok" as const),
      page
        .getByTestId("login-error")
        .waitFor({ state: "visible", timeout: 12_000 })
        .then(async () => {
          const text =
            (await page.getByTestId("login-error").textContent()) ?? "";
          return /too many requests/i.test(text)
            ? ("rate" as const)
            : ("fail" as const);
        }),
    ]).catch(() => "timeout" as const);

    if (outcome === "ok") {
      await page.context().storageState({ path: AUTH_FILE });
      return;
    }
    if (outcome === "rate" && attempt < maxAttempts) {
      console.log(`  rate-limited on sign-in; waiting 11s (attempt ${attempt})`);
      await page.waitForTimeout(11_000);
      continue;
    }
    throw new Error(
      `login failed (attempt ${attempt}/${maxAttempts}): ${outcome}`,
    );
  }
}

async function sessionIsValid(page: Page): Promise<boolean> {
  await page.goto(`${APP_URL}/app`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const url = page.url();
  return /\/app(\/|$|\?)/.test(url) && !/\/login/.test(url);
}

async function ensureAuthenticated(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    baseURL: APP_URL,
    storageState: fs.existsSync(AUTH_FILE) ? AUTH_FILE : undefined,
  });
  const page = await context.newPage();

  if (await sessionIsValid(page)) {
    console.log("  reusing storageState session");
    return page;
  }

  console.log("  storageState missing/expired — logging in once");
  await loginOnce(page);
  return page;
}

const publicFrames: FrameSpec[] = [
  {
    id: "A2",
    file: "02-login.png",
    capture: async (page) => {
      await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
      await page.getByTestId("login-form").waitFor({ state: "visible" });
      // Ensure empty fields — no secrets on frame
      await page.getByTestId("login-email").fill("");
      await page.getByTestId("login-password").fill("");
      await shot(page, "02-login.png");
    },
  },
  {
    id: "B1",
    file: "03-login-form.png",
    capture: async (page) => {
      await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
      await page.getByTestId("login-form").waitFor({ state: "visible" });
      await page.getByTestId("login-email").fill(ADMIN_EMAIL);
      // Password empty (or masked) — never show plaintext secret
      await page.getByTestId("login-password").fill("");
      await shot(page, "03-login-form.png");
    },
  },
];

const authedFrames: FrameSpec[] = [
  {
    id: "B2",
    file: "04-dashboard.png",
    capture: async (page) => {
      await page.goto(`${APP_URL}/app`, { waitUntil: "networkidle" });
      await page
        .getByRole("heading", { name: /dashboard/i })
        .waitFor({ state: "visible", timeout: 15_000 });
      await shot(page, "04-dashboard.png");
    },
  },
  {
    id: "C3",
    file: "08-vulnerabilities-table.png",
    capture: async (page) => {
      await page.goto(`${APP_URL}/app/vulnerabilities`, {
        waitUntil: "networkidle",
      });
      await page.getByTestId("vuln-table").waitFor({ state: "visible" });
      await page.getByTestId("vuln-row").first().waitFor({ state: "visible" });
      await shot(page, "08-vulnerabilities-table.png");
    },
  },
  {
    id: "C4",
    file: "09-vulnerability-card.png",
    capture: async (page) => {
      await page.goto(`${APP_URL}/app/vulnerabilities/${BOTH_CVE_BDU_ID}`, {
        waitUntil: "networkidle",
      });
      await page.getByTestId("vuln-detail").waitFor({ state: "visible" });
      await page.getByTestId("vuln-detail-cve").waitFor({ state: "visible" });
      await page.getByTestId("vuln-detail-bdu").waitFor({ state: "visible" });
      await shot(page, "09-vulnerability-card.png");
    },
  },
  {
    id: "F2",
    file: "18-app-shell-nav.png",
    capture: async (page) => {
      await page.goto(`${APP_URL}/app`, { waitUntil: "networkidle" });
      await page
        .getByRole("navigation")
        .waitFor({ state: "visible", timeout: 15_000 });
      await shot(page, "18-app-shell-nav.png");
    },
  },
];

async function main() {
  console.log(`Capture Wave 1 screenshots → ${OUT_DIR}`);
  console.log(`APP_URL=${APP_URL}`);
  await ensureOutDir();

  const browser = await chromium.launch({ headless: true });

  try {
    // Public frames (no auth) — fresh context, no cookies
    const publicCtx = await browser.newContext({
      viewport: VIEWPORT,
      baseURL: APP_URL,
    });
    const publicPage = await publicCtx.newPage();
    for (const frame of publicFrames) {
      console.log(`[${frame.id}] ${frame.file}`);
      await frame.capture(publicPage);
    }
    await publicCtx.close();

    // Authenticated frames — one shared session
    const authedPage = await ensureAuthenticated(browser);
    for (const frame of authedFrames) {
      console.log(`[${frame.id}] ${frame.file}`);
      await frame.capture(authedPage);
    }
    await authedPage.context().close();
  } finally {
    await browser.close();
  }

  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
