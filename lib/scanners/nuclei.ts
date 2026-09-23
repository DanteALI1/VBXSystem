import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSeverity } from "@/lib/domain/severity";
import {
  copyFixtureTo,
  ensureDir,
  resolveBinary,
  runCommand,
  shouldUseFixtureMode,
  writeMeta,
} from "./fixture";
import type {
  FindingDraft,
  ScanJobStartContext,
  ScanReport,
  ScannerAdapter,
} from "./types";

const NUCLEI_FIXTURE = "nuclei-sample.jsonl";

function textOf(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function firstCve(value: unknown): string | undefined {
  if (typeof value === "string") {
    const m = value.match(/CVE-\d{4}-\d+/i);
    return m ? m[0].toUpperCase() : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstCve(item);
      if (found) return found;
    }
  }
  return undefined;
}

/** Parse nuclei JSONL into FindingDraft[]. Invalid lines are skipped. */
export function parseNucleiJsonl(jsonl: string): FindingDraft[] {
  const drafts: FindingDraft[] = [];
  const lines = jsonl.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const info =
      row.info && typeof row.info === "object"
        ? (row.info as Record<string, unknown>)
        : {};
    const classification =
      info.classification && typeof info.classification === "object"
        ? (info.classification as Record<string, unknown>)
        : {};

    const title =
      textOf(info.name) ??
      textOf(row["template-id"]) ??
      textOf(row.templateID) ??
      textOf(row["template_id"]) ??
      "Nuclei finding";

    const description =
      textOf(info.description) ??
      textOf(row["matched-at"]) ??
      textOf(row.matched_at) ??
      textOf(row.host) ??
      undefined;

    const severity = parseSeverity(
      textOf(info.severity) ?? textOf(row.severity),
    );

    const cveId =
      firstCve(classification["cve-id"]) ??
      firstCve(classification.cveId) ??
      firstCve(row.cve) ??
      firstCve(row.cve_id) ??
      undefined;

    drafts.push({
      title,
      description: description ?? undefined,
      severity,
      cveId,
      raw: row,
    });
  }

  return drafts;
}

export class NucleiAdapter implements ScannerAdapter {
  readonly type = "nuclei" as const;

  async start(ctx: ScanJobStartContext): Promise<ScanReport> {
    ensureDir(ctx.reportDir);
    const rawPath = join(ctx.reportDir, "raw.jsonl");
    const binary = resolveBinary("NUCLEI_BIN", "nuclei");
    const fixture = shouldUseFixtureMode(ctx.options, binary);

    if (fixture) {
      copyFixtureTo(rawPath, NUCLEI_FIXTURE);
      writeMeta(ctx.reportDir, {
        adapter: "nuclei",
        fixture: true,
        reason:
          ctx.options.fixture === true
            ? "options.fixture"
            : binary == null
              ? "binary_missing"
              : "SCAN_FIXTURE_MODE",
        target: ctx.job.target,
      });
      return { reportDir: ctx.reportDir, rawPath, fixture: true };
    }

    await runCommand(binary!, [
      "-u",
      ctx.job.target,
      "-jsonl",
      "-o",
      rawPath,
      "-silent",
    ]);
    writeMeta(ctx.reportDir, {
      adapter: "nuclei",
      fixture: false,
      binary,
      target: ctx.job.target,
    });
    return { reportDir: ctx.reportDir, rawPath, fixture: false };
  }

  async parse(report: ScanReport): Promise<FindingDraft[]> {
    const jsonl = readFileSync(report.rawPath, "utf8");
    return parseNucleiJsonl(jsonl);
  }
}
