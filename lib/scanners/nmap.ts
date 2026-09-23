import { readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { parseSeverity } from "@/lib/domain/severity";
import type { Severity } from "@/db/schema";
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

const NMAP_FIXTURE = "nmap-sample.xml";

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && value !== null && "#text" in value) {
    return textOf((value as { "#text": unknown })["#text"]);
  }
  return null;
}

function attr(
  node: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!node) return null;
  return textOf(node[`@_${key}`] ?? node[key]);
}

/** Parse nmap XML into FindingDraft[] (open ports + script vulns). */
export function parseNmapXml(xml: string): FindingDraft[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
  });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const nmaprun = (doc.nmaprun ?? doc) as Record<string, unknown>;
  const hosts = asArray(
    nmaprun.host as Record<string, unknown> | Record<string, unknown>[] | undefined,
  ) as Record<string, unknown>[];
  const drafts: FindingDraft[] = [];

  for (const host of hosts) {
    const portsNode = host.ports as Record<string, unknown> | undefined;
    const ports = asArray(
      portsNode?.port as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined,
    ) as Record<string, unknown>[];

    for (const port of ports) {
      const state = port.state as Record<string, unknown> | undefined;
      const stateName = (attr(state, "state") ?? "").toLowerCase();
      if (stateName && stateName !== "open") continue;

      const portId = Number(attr(port, "portid") ?? attr(port, "portId") ?? 0);
      const protocol = (attr(port, "protocol") ?? "tcp").toLowerCase();
      if (!Number.isFinite(portId) || portId <= 0) continue;

      const serviceNode = port.service as Record<string, unknown> | undefined;
      const name = attr(serviceNode, "name") ?? undefined;
      const product = attr(serviceNode, "product") ?? undefined;
      const version = attr(serviceNode, "version") ?? undefined;

      const serviceLabel = [name, product, version].filter(Boolean).join(" ");
      drafts.push({
        title: `Open port ${portId}/${protocol}${serviceLabel ? ` (${serviceLabel})` : ""}`,
        description: `Nmap discovered an open ${protocol} port ${portId}.`,
        severity: "info",
        service: {
          port: portId,
          protocol,
          name,
          product,
          version,
        },
        raw: { portId, protocol, name, product, version },
      });

      const scripts = asArray(
        port.script as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | undefined,
      ) as Record<string, unknown>[];
      for (const script of scripts) {
        const scriptId = attr(script, "id") ?? "script";
        const output = attr(script, "output") ?? textOf(script) ?? "";
        const severity = inferScriptSeverity(scriptId, output);
        const cveMatch = output.match(/CVE-\d{4}-\d+/i);
        drafts.push({
          title: `Nmap script ${scriptId} on ${portId}/${protocol}`,
          description: output.slice(0, 4000) || undefined,
          severity,
          cveId: cveMatch ? cveMatch[0].toUpperCase() : undefined,
          service: {
            port: portId,
            protocol,
            name,
            product,
            version,
          },
          raw: { scriptId, output },
        });
      }
    }

    // Host-level scripts
    const hostScripts = asArray(
      (host.hostscript as Record<string, unknown> | undefined)?.script as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined,
    ) as Record<string, unknown>[];
    for (const script of hostScripts) {
      const scriptId = attr(script, "id") ?? "host-script";
      const output = attr(script, "output") ?? textOf(script) ?? "";
      const severity = inferScriptSeverity(scriptId, output);
      const cveMatch = output.match(/CVE-\d{4}-\d+/i);
      drafts.push({
        title: `Nmap host script ${scriptId}`,
        description: output.slice(0, 4000) || undefined,
        severity,
        cveId: cveMatch ? cveMatch[0].toUpperCase() : undefined,
        raw: { scriptId, output },
      });
    }
  }

  return drafts;
}

function inferScriptSeverity(scriptId: string, output: string): Severity {
  const blob = `${scriptId} ${output}`.toLowerCase();
  if (blob.includes("critical") || blob.includes("vuln") && blob.includes("critical")) {
    return parseSeverity("critical");
  }
  if (
    blob.includes("high") ||
    /cve-\d{4}-\d+/i.test(blob) ||
    scriptId.includes("vuln")
  ) {
    return parseSeverity(
      blob.includes("critical")
        ? "critical"
        : blob.includes("medium")
          ? "medium"
          : blob.includes("low")
            ? "low"
            : "high",
    );
  }
  if (blob.includes("medium")) return "medium";
  if (blob.includes("low")) return "low";
  if (scriptId.includes("vuln") || scriptId.includes("exploit")) return "high";
  return "info";
}

export class NmapAdapter implements ScannerAdapter {
  readonly type = "nmap" as const;

  async start(ctx: ScanJobStartContext): Promise<ScanReport> {
    ensureDir(ctx.reportDir);
    const rawPath = join(ctx.reportDir, "raw.xml");
    const binary = resolveBinary("NMAP_BIN", "nmap");
    const fixture = shouldUseFixtureMode(ctx.options, binary);

    if (fixture) {
      copyFixtureTo(rawPath, NMAP_FIXTURE);
      writeMeta(ctx.reportDir, {
        adapter: "nmap",
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
      "-oX",
      rawPath,
      "-sV",
      "--open",
      ctx.job.target,
    ]);
    writeMeta(ctx.reportDir, {
      adapter: "nmap",
      fixture: false,
      binary,
      target: ctx.job.target,
    });
    return { reportDir: ctx.reportDir, rawPath, fixture: false };
  }

  async parse(report: ScanReport): Promise<FindingDraft[]> {
    const xml = readFileSync(report.rawPath, "utf8");
    return parseNmapXml(xml);
  }
}
