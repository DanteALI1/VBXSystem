import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.{test,spec}.ts", "tests/integration/**/*.{test,spec}.ts"],
    setupFiles: ["./tests/integration/helpers/vitest-setup.ts"],
    globals: false,
    // Integration suites share DATABASE_URL_TEST — avoid parallel SyncState races
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
