import { test as setup } from "@playwright/test";
import path from "node:path";
import { loginAsAdmin } from "../helpers/auth";

const authFile = path.join(__dirname, "../../playwright/.auth/admin.json");

setup("authenticate as admin", async ({ page }) => {
  await loginAsAdmin(page);
  await page.context().storageState({ path: authFile });
});
