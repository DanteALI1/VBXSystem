import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, writeMeta } from "./fixture";
import type {
  FindingDraft,
  ScanJobStartContext,
  ScanReport,
  ScannerAdapter,
} from "./types";

/**
 * OpenVAS stub — fails with a clear message unless options.fixture,
 * in which case it succeeds with empty findings.
 */
export class OpenvasAdapter implements ScannerAdapter {
  readonly type = "openvas" as const;

  async start(ctx: ScanJobStartContext): Promise<ScanReport> {
    ensureDir(ctx.reportDir);
    const rawPath = join(ctx.reportDir, "raw.xml");

    if (ctx.options.fixture === true) {
      writeFileSync(rawPath, "<openvas/>\n", "utf8");
      writeMeta(ctx.reportDir, {
        adapter: "openvas",
        fixture: true,
        stub: true,
        note: "empty fixture success",
      });
      return { reportDir: ctx.reportDir, rawPath, fixture: true };
    }

    writeMeta(ctx.reportDir, {
      adapter: "openvas",
      stub: true,
      error: "not implemented in MVP",
    });
    throw new Error("openvas adapter not implemented in MVP");
  }

  async parse(report: ScanReport): Promise<FindingDraft[]> {
    void report;
    return [];
  }
}
