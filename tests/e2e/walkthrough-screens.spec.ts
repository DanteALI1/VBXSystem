import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * TC-017 — screenshot walkthrough smoke: required PNG files exist.
 */
const REQUIRED = [
  "01-docker-up.png",
  "02-login.png",
  "03-login-form.png",
  "04-dashboard.png",
  "05-config.png",
  "06-sync-before.png",
  "07-sync-after.png",
  "08-vulns-table.png",
  "09-vuln-detail.png",
  "10-search-views.png",
  "11-assets.png",
  "12-asset-detail.png",
  "13-allowlist.png",
  "14-scan-create.png",
  "15-scan-status.png",
  "16-findings.png",
  "17-finding-status.png",
  "18-dashboard-totals.png",
  "19-app-shell.png",
];

test("TC-017 walkthrough PNGs present", () => {
  const dir = path.join(process.cwd(), "docs/setup-walkthrough/images");
  for (const name of REQUIRED) {
    const full = path.join(dir, name);
    expect(fs.existsSync(full), `missing ${name}`).toBe(true);
    expect(fs.statSync(full).size).toBeGreaterThan(1000);
  }
});
