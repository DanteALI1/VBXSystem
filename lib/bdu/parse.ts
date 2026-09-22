import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { Severity } from "@/db/schema";
import { parseSeverity } from "@/lib/domain/severity";

export type ParsedBduVulnerability = {
  bduId: string;
  cveId: string | null;
  title: string;
  description: string | null;
  severity: Severity;
  cvssScore: string | null;
  vendor: string | null;
  product: string | null;
  status: string | null;
  rawXml: string;
};

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

function extractCveId(vul: Record<string, unknown>): string | null {
  const cveNode = vul.cve ?? vul.CVE;
  if (!cveNode) return null;

  for (const entry of asArray(cveNode)) {
    if (typeof entry === "string") {
      const m = entry.match(/CVE-\d{4}-\d+/i);
      if (m) return m[0].toUpperCase();
      continue;
    }
    if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      const id =
        textOf(obj.id) ??
        textOf(obj.identifier) ??
        textOf(obj["#text"]) ??
        textOf(obj.value);
      if (id) {
        const m = id.match(/CVE-\d{4}-\d+/i);
        if (m) return m[0].toUpperCase();
      }
    }
  }
  return null;
}

function extractCvssScore(vul: Record<string, unknown>): string | null {
  const cvss = vul.cvss ?? vul.CVSS;
  if (cvss == null) return null;
  if (typeof cvss === "number" || typeof cvss === "string") {
    const n = Number(cvss);
    return Number.isFinite(n) ? n.toFixed(1) : null;
  }
  if (typeof cvss === "object") {
    const obj = cvss as Record<string, unknown>;
    const candidates = [
      obj.base,
      obj.base_score,
      obj.baseScore,
      obj.score,
      obj.vector,
    ];
    for (const c of candidates) {
      const t = textOf(c);
      if (t) {
        const n = Number(t);
        if (Number.isFinite(n)) return n.toFixed(1);
      }
    }
  }
  return null;
}

function extractVendorProduct(vul: Record<string, unknown>): {
  vendor: string | null;
  product: string | null;
} {
  const softRoot =
    vul.vulnerable_software ??
    vul.vulnerableSoftware ??
    vul.soft ??
    vul.vendor;

  let vendor: string | null =
    typeof vul.vendor === "string" ? textOf(vul.vendor) : null;
  let product: string | null =
    typeof vul.product === "string" ? textOf(vul.product) : null;

  for (const soft of asArray(softRoot)) {
    if (!soft || typeof soft !== "object") continue;
    const obj = soft as Record<string, unknown>;
    const softs = asArray(obj.soft ?? obj);
    for (const s of softs) {
      if (!s || typeof s !== "object") continue;
      const row = s as Record<string, unknown>;
      vendor = vendor ?? textOf(row.vendor);
      product = product ?? textOf(row.product) ?? textOf(row.name);
      if (vendor || product) return { vendor, product };
    }
    vendor = vendor ?? textOf(obj.vendor);
    product = product ?? textOf(obj.product);
  }

  return { vendor, product };
}

function vulToRawXml(vul: Record<string, unknown>): string {
  // Best-effort: keep a compact JSON snapshot if we don't have original snippet.
  // Prefer identifier-based reconstruction for source storage.
  try {
    return `<vul>${JSON.stringify(vul)}</vul>`;
  } catch {
    return "<vul />";
  }
}

function mapVulNode(vul: Record<string, unknown>): ParsedBduVulnerability | null {
  const bduId =
    textOf(vul.identifier) ??
    textOf(vul.id) ??
    textOf(vul.bdu_id) ??
    textOf(vul.bduId);
  if (!bduId) return null;

  const name = textOf(vul.name) ?? textOf(vul.title);
  const description = textOf(vul.description);
  const severity = parseSeverity(textOf(vul.severity) ?? textOf(vul.danger));
  const { vendor, product } = extractVendorProduct(vul);
  const cveId = extractCveId(vul);
  const cvssScore = extractCvssScore(vul);
  const status = textOf(vul.status);

  return {
    bduId,
    cveId,
    title: name ?? bduId,
    description,
    severity,
    cvssScore,
    vendor,
    product,
    status,
    rawXml: vulToRawXml(vul),
  };
}

/**
 * Parse BDU vulxml document into vulnerability records.
 * Skips invalid `<vul>` nodes instead of aborting the whole file.
 */
export function parseBduXml(xml: string): {
  records: ParsedBduVulnerability[];
  skipped: number;
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: true,
    isArray: (name) => name === "vul" || name === "soft" || name === "cve",
  });

  const doc = parser.parse(xml) as Record<string, unknown>;
  const root =
    (doc.vulnerabilities as Record<string, unknown> | undefined) ??
    (doc.Vulnerabilities as Record<string, unknown> | undefined) ??
    doc;

  const vulNodes = asArray(
    (root as { vul?: unknown }).vul ??
      (root as { Vul?: unknown }).Vul ??
      [],
  );

  const records: ParsedBduVulnerability[] = [];
  let skipped = 0;

  for (const node of vulNodes) {
    if (!node || typeof node !== "object") {
      skipped += 1;
      continue;
    }
    const mapped = mapVulNode(node as Record<string, unknown>);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    records.push(mapped);
  }

  return { records, skipped };
}

export function hashBuffer(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function bduExternalUrl(bduId: string): string {
  const numeric = bduId.replace(/^BDU:/i, "");
  return `https://bdu.fstec.ru/vul/${numeric}`;
}
