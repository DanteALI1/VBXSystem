import fs from "node:fs/promises";
import type { Severity } from "@/lib/domain/severity";
import type {
  FindingDraft,
  ScanJobContext,
  ScanStartResult,
  ScannerAdapter,
} from "../types";
import { writeReportFile } from "../report-store";
import {
  findBinary,
  fixturePath,
  runCommand,
  shouldUseFixture,
} from "../runtime";
import { validateNucleiTemplateOptions } from "../nuclei-policy";

function mapSeverity(raw: unknown): Severity | null {
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase();
  if (
    s === "none" ||
    s === "low" ||
    s === "medium" ||
    s === "high" ||
    s === "critical" ||
    s === "info"
  ) {
    return s === "info" ? "none" : (s as Severity);
  }
  return null;
}

function extractCve(info: Record<string, unknown> | undefined): string | null {
  const classification = info?.classification as
    | { "cve-id"?: string | string[]; cveId?: string | string[] }
    | undefined;
  const raw =
    classification?.["cve-id"] ??
    classification?.cveId ??
    (info?.["cve-id"] as string | string[] | undefined);
  if (!raw) return null;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) return null;
  const m = String(first).match(/CVE-\d{4}-\d{4,}/i);
  return m ? m[0].toUpperCase() : String(first).toUpperCase();
}

function parseNucleiJsonl(jsonl: string): FindingDraft[] {
  const drafts: FindingDraft[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    const info = (row.info ?? {}) as Record<string, unknown>;
    const cveId = extractCve(info);
    const name =
      (typeof info.name === "string" && info.name) ||
      (typeof row["template-id"] === "string" && row["template-id"]) ||
      "nuclei finding";
    const host =
      (typeof row.host === "string" && row.host) ||
      (typeof row["matched-at"] === "string"
        ? row["matched-at"]
        : undefined);

    drafts.push({
      kind: "finding",
      title: name,
      description:
        typeof info.description === "string" ? info.description : undefined,
      severity: mapSeverity(info.severity),
      cveId,
      host: typeof host === "string" ? host : undefined,
      rawEvidence: {
        scanner: "nuclei",
        templateId: row["template-id"],
        type: row.type,
        matchedAt: row["matched-at"],
        timestamp: row.timestamp,
        // detection evidence only — never payload/exploit output
        info: {
          name: info.name,
          severity: info.severity,
          classification: info.classification,
        },
      },
    });
  }
  return drafts;
}

/**
 * Nuclei adapter — detection-only.
 * Templates limited to cves/ and vulnerabilities/.
 * Never passes exploit / intrusive / auto-exploitation flags.
 */
export class NucleiAdapter implements ScannerAdapter {
  readonly type = "nuclei" as const;

  validateOptions(options: Record<string, unknown>): void {
    validateNucleiTemplateOptions(options);
  }

  async start(job: ScanJobContext): Promise<ScanStartResult> {
    const target = job.targets[0];
    if (!target) throw new Error("nuclei job requires at least one target");

    // Policy gate before any binary invocation
    const templatePaths = validateNucleiTemplateOptions(job.options);

    const filename = "nuclei.jsonl";
    if (shouldUseFixture("nuclei")) {
      const fixture =
        typeof job.options.fixturePath === "string"
          ? job.options.fixturePath
          : fixturePath("nuclei-sample.jsonl");
      const jsonl = await fs.readFile(fixture, "utf8");
      const reportPath = await writeReportFile(job.id, filename, jsonl);
      return { reportPath, usedFixture: true };
    }

    const bin = findBinary("nuclei");
    if (!bin) {
      const jsonl = await fs.readFile(
        fixturePath("nuclei-sample.jsonl"),
        "utf8",
      );
      const reportPath = await writeReportFile(job.id, filename, jsonl);
      return { reportPath, usedFixture: true };
    }

    // Detection-only argv: -u target, -t allowed templates, -jsonl to stdout.
    // Explicitly omit: -interactsh-server overrides that enable exploitation,
    // headless exploit flows, and user-supplied -t outside allowlist (validated above).
    const args = [
      "-u",
      target,
      "-jsonl",
      "-silent",
      "-disable-update-check",
    ];
    for (const t of templatePaths) {
      args.push("-t", t);
    }

    const { stdout } = await runCommand(bin, args, {
      timeoutMs: Number(job.options.timeoutMs) || 300_000,
    });
    const reportPath = await writeReportFile(job.id, filename, stdout);
    return { reportPath, usedFixture: false };
  }

  parse(report: string, _job: ScanJobContext): FindingDraft[] {
    return parseNucleiJsonl(report);
  }
}

export const nucleiAdapter = new NucleiAdapter();
