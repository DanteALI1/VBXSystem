/**
 * Capture setup walkthrough screenshots via Playwright.
 * Wave 0: stub — real capture in Waves 1–3 (requires running app).
 */
import path from "node:path";

const OUT = path.join(process.cwd(), "docs/setup-walkthrough/images");

async function main() {
  console.log("test:screenshots stub (Wave 0)");
  console.log("Output dir:", OUT);
  console.log(
    "Full A1–F2 + C5 capture runs after Auth/UI (Wave 1+) with docker healthy.",
  );
  // Wave 1+: playwright chromium screenshots
}

main();
