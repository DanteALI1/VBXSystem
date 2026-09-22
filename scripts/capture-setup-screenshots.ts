/**
 * Setup walkthrough screenshot capture (Wave 1 + Wave 2).
 *
 * Env:
 *   APP_URL                  (default http://localhost:3000)
 *   BOOTSTRAP_ADMIN_EMAIL    (default admin@local.dev)
 *   BOOTSTRAP_ADMIN_PASSWORD (default ChangeMe123!)
 *
 * Reuses playwright/.auth/admin.json when present to avoid Better Auth
 * /sign-in rate-limit (3 / 10s). Falls back to a single login with retries.
 *
 * Wave 2 expects a running worker (`npm run worker`) so fixture sync can
 * reach succeeded for frame C2.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
const SYNC_WAIT_MS = 90_000;

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

async function gotoSync(page: Page) {
  await page.goto(`${APP_URL}/app/settings/sync`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("sync-panel").waitFor({ state: "visible" });
  await page.getByTestId("sync-status").waitFor({ state: "visible" });
}

async function waitForSyncSucceeded(page: Page) {
  const deadline = Date.now() + SYNC_WAIT_MS;
  while (Date.now() < deadline) {
    const res = await page.request.get(`${APP_URL}/api/sync/status`);
    if (!res.ok()) {
      throw new Error(`sync status HTTP ${res.status()}`);
    }
    const body = (await res.json()) as {
      nvd: { status: string };
      bdu: { status: string };
    };
    if (body.nvd.status === "succeeded" && body.bdu.status === "succeeded") {
      return;
    }
    if (body.nvd.status === "failed" || body.bdu.status === "failed") {
      throw new Error(
        `sync failed: nvd=${body.nvd.status} bdu=${body.bdu.status}`,
      );
    }
    await page.waitForTimeout(1_500);
  }
  throw new Error("timed out waiting for sync succeeded");
}

async function ensureAssetsSeeded(page: Page) {
  const res = await page.request.get(`${APP_URL}/api/assets`);
  if (!res.ok()) throw new Error(`assets list HTTP ${res.status()}`);
  const body = (await res.json()) as { items?: unknown[]; total?: number };
  const total = body.total ?? body.items?.length ?? 0;
  if (total > 0) {
    console.log(`  assets already present (${total})`);
    return;
  }
  console.log("  assets empty — running npm run seed:assets");
  await execFileAsync("npm", ["run", "seed:assets"], {
    cwd: process.cwd(),
    env: process.env,
  });
}

async function ensureAllowlistEntry(page: Page) {
  const listRes = await page.request.get(`${APP_URL}/api/allowlist`);
  if (!listRes.ok()) throw new Error(`allowlist list HTTP ${listRes.status()}`);
  const list = (await listRes.json()) as {
    items?: unknown[];
    total?: number;
  };
  const total = list.total ?? list.items?.length ?? 0;
  if (total > 0) {
    console.log(`  allowlist already has ${total} entr${total === 1 ? "y" : "ies"}`);
    return;
  }
  console.log("  allowlist empty — creating CIDR entry via API");
  const create = await page.request.post(`${APP_URL}/api/allowlist`, {
    data: {
      type: "cidr",
      pattern: "10.0.0.0/8",
      enabled: true,
      description: "Lab private network (walkthrough seed)",
    },
  });
  if (!create.ok()) {
    const text = await create.text();
    throw new Error(`allowlist create HTTP ${create.status()}: ${text}`);
  }
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
    id: "B3",
    file: "05-config-env.png",
    capture: async (page) => {
      // Config via Sync settings: NVD_SYNC_DAYS / NVD_SYNC_MODE + fixture control
      // (secrets not shown).
      await gotoSync(page);
      await page.getByTestId("sync-config").waitFor({ state: "visible" });
      await page.getByTestId("sync-config-nvd-days").waitFor({ state: "visible" });
      await page.getByTestId("sync-fixture-mode").waitFor({ state: "visible" });
      await shot(page, "05-config-env.png");
    },
  },
  {
    id: "C1",
    file: "06-sync-before.png",
    capture: async (page) => {
      await gotoSync(page);
      await page.getByTestId("sync-fixture-mode").check();
      await page.getByTestId("sync-nvd").waitFor({ state: "visible" });
      await shot(page, "06-sync-before.png");
    },
  },
  {
    id: "C2",
    file: "07-sync-after.png",
    capture: async (page) => {
      await gotoSync(page);
      await page.getByTestId("sync-fixture-mode").check();
      // Trigger fixture sync for both sources
      await page.getByTestId("sync-nvd").click();
      await page.getByTestId("sync-bdu").click();
      console.log("  waiting for fixture sync → succeeded…");
      await waitForSyncSucceeded(page);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByTestId("sync-status").waitFor({ state: "visible" });
      // Prefer UI badge text when present
      await page
        .getByText("succeeded", { exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      await shot(page, "07-sync-after.png");
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
    id: "D1",
    file: "10-assets.png",
    capture: async (page) => {
      await ensureAssetsSeeded(page);
      await page.goto(`${APP_URL}/app/assets`, { waitUntil: "networkidle" });
      await page.getByTestId("assets-table").waitFor({ state: "visible" });
      await page.getByTestId("asset-row").first().waitFor({ state: "visible" });
      await shot(page, "10-assets.png");
    },
  },
  {
    id: "D2",
    file: "11-asset-detail.png",
    capture: async (page) => {
      await ensureAssetsSeeded(page);
      await page.goto(`${APP_URL}/app/assets`, { waitUntil: "networkidle" });
      await page.getByTestId("asset-hostname-link").first().click();
      await page.waitForURL(/\/app\/assets\/[^/]+/);
      await page.getByTestId("asset-detail").waitFor({ state: "visible" });
      await page
        .getByTestId("asset-detail-hostname")
        .waitFor({ state: "visible" });
      await shot(page, "11-asset-detail.png");
    },
  },
  {
    id: "D3",
    file: "12-allowlist.png",
    capture: async (page) => {
      await ensureAllowlistEntry(page);
      await page.goto(`${APP_URL}/app/settings/allowlist`, {
        waitUntil: "networkidle",
      });
      await page.getByTestId("allowlist-table").waitFor({ state: "visible" });
      await page
        .getByTestId("allowlist-row")
        .first()
        .waitFor({ state: "visible" });
      await shot(page, "12-allowlist.png");
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
  console.log(`Capture Wave 1+2 screenshots → ${OUT_DIR}`);
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
