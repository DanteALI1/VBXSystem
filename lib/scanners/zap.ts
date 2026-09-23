import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, writeMeta } from "./fixture";
import type {
  FindingDraft,
  ScanJobStartContext,
  ScanReport,
  ScannerAdapter,
} from "./types";

/** ZAP stub — fail unless options.fixture (empty success). */
export class ZapAdapter implements ScannerAdapter {
  readonly type = "zap" as const;

  async start(ctx: ScanJobStartContext): Promise<ScanReport> {
    ensureDir(ctx.reportDir);
    const rawPath = join(ctx.reportDir, "raw.json");

    if (ctx.options.fixture === true) {
      writeFileSync(rawPath, "[]\n", "utf8");
      writeMeta(ctx.reportDir, {
        adapter: "zap",
        fixture: true,
        stub: true,
        note: "empty fixture success",
      });
      return { reportDir: ctx.reportDir, rawPath, fixture: true };
    }

    writeMeta(ctx.reportDir, {
      adapter: "zap",
      stub: true,
      error: "not implemented in MVP",
    });
    throw new Error("zap adapter not implemented in MVP");
  }

  async parse(report: ScanReport): Promise<FindingDraft[]> {
    void report;
    return [];
  }
}
