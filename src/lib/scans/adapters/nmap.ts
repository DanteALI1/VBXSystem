import fs from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
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

type XmlAttrs = Record<string, string>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseNmapXml(xml: string): FindingDraft[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const doc = parser.parse(xml) as {
    nmaprun?: { host?: unknown };
  };
  const hosts = asArray(doc.nmaprun?.host);
  const drafts: FindingDraft[] = [];

  for (const hostRaw of hosts) {
    const host = hostRaw as {
      address?: XmlAttrs | XmlAttrs[];
      hostnames?: { hostname?: XmlAttrs | XmlAttrs[] };
      ports?: {
        port?:
          | {
              "@_portid"?: string;
              "@_protocol"?: string;
              state?: { "@_state"?: string };
              service?: {
                "@_name"?: string;
                "@_product"?: string;
                "@_version"?: string;
                "@_extrainfo"?: string;
              };
              script?: XmlAttrs | XmlAttrs[];
            }
          | Array<{
              "@_portid"?: string;
              "@_protocol"?: string;
              state?: { "@_state"?: string };
              service?: {
                "@_name"?: string;
                "@_product"?: string;
                "@_version"?: string;
                "@_extrainfo"?: string;
              };
              script?: XmlAttrs | XmlAttrs[];
            }>;
      };
    };

    const addresses = asArray(host.address);
    const ipv4 =
      addresses.find((a) => a["@_addrtype"] === "ipv4")?.["@_addr"] ??
      addresses[0]?.["@_addr"];
    const hostnames = asArray(host.hostnames?.hostname);
    const hostname = hostnames[0]?.["@_name"];

    const ports = asArray(host.ports?.port);

    for (const port of ports) {
      const state = port.state?.["@_state"];
      if (state && state !== "open") continue;

      const portId = Number(port["@_portid"]);
      const protocol = String(port["@_protocol"] ?? "tcp");
      const svc = port.service;
      const product = svc?.["@_product"];
      const version = svc?.["@_version"];
      const serviceName = svc?.["@_name"];
      const title = `${serviceName ?? "service"} ${portId}/${protocol} on ${ipv4 ?? hostname ?? "host"}`;

      drafts.push({
        kind: "service",
        title,
        description: product
          ? `${product}${version ? ` ${version}` : ""}`
          : undefined,
        host: ipv4 ?? hostname,
        port: Number.isFinite(portId) ? portId : undefined,
        protocol,
        product,
        version,
        serviceName,
        banner: svc?.["@_extrainfo"],
        rawEvidence: {
          scanner: "nmap",
          host: ipv4,
          hostname,
          port: portId,
          protocol,
          service: svc ?? null,
        },
      });

      const scripts = asArray(port.script);
      for (const script of scripts) {
        const output = String(script["@_output"] ?? script["#text"] ?? "");
        const cveMatch = output.match(/CVE-\d{4}-\d{4,}/gi) ?? [];
        for (const cve of cveMatch) {
          drafts.push({
            kind: "finding",
            title: `${cve} via nmap script on ${portId}/${protocol}`,
            cveId: cve.toUpperCase(),
            host: ipv4 ?? hostname,
            port: Number.isFinite(portId) ? portId : undefined,
            protocol,
            severity: null,
            rawEvidence: {
              scanner: "nmap",
              script: script["@_id"],
              output,
            },
          });
        }
      }
    }
  }

  return drafts;
}

export class NmapAdapter implements ScannerAdapter {
  readonly type = "nmap" as const;

  async start(job: ScanJobContext): Promise<ScanStartResult> {
    const target = job.targets[0];
    if (!target) throw new Error("nmap job requires at least one target");

    const filename = "nmap.xml";
    if (shouldUseFixture("nmap")) {
      const fixture =
        typeof job.options.fixturePath === "string"
          ? job.options.fixturePath
          : fixturePath("nmap-sample.xml");
      const xml = await fs.readFile(fixture, "utf8");
      const reportPath = await writeReportFile(job.id, filename, xml);
      return { reportPath, usedFixture: true };
    }

    const bin = findBinary("nmap");
    if (!bin) {
      const xml = await fs.readFile(fixturePath("nmap-sample.xml"), "utf8");
      const reportPath = await writeReportFile(job.id, filename, xml);
      return { reportPath, usedFixture: true };
    }

    const ports =
      typeof job.options.ports === "string"
        ? job.options.ports
        : typeof job.options.ports === "number"
          ? String(job.options.ports)
          : undefined;

    // Build safe argv — never shell-interpolate targets
    const nmapArgs = ["-sV", "-oX", "-"];
    if (ports) nmapArgs.push("-p", ports);
    nmapArgs.push(target);

    const { stdout } = await runCommand(bin, nmapArgs, {
      timeoutMs: Number(job.options.timeoutMs) || 180_000,
    });
    const reportPath = await writeReportFile(job.id, filename, stdout);
    return { reportPath, usedFixture: false };
  }

  parse(report: string, _job: ScanJobContext): FindingDraft[] {
    return parseNmapXml(report);
  }
}

export const nmapAdapter = new NmapAdapter();
