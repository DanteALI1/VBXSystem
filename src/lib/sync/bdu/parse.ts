import { XMLParser } from "fast-xml-parser";
import {
  severityFromCvss,
  type Severity,
} from "@/lib/domain/severity";
import { logger } from "@/lib/logger";
import type { ParsedBduRecord } from "./types";

const SEVERITY_SET = new Set<Severity>([
  "none",
  "low",
  "medium",
  "high",
  "critical",
]);

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    return s.length ? s : null;
  }
  if (typeof value === "object" && value !== null && "#text" in value) {
    return textOf((value as { "#text"?: unknown })["#text"]);
  }
  return null;
}

function normalizeCve(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().toUpperCase().match(/CVE-\d{4}-\d{4,}/);
  return m ? m[0] : null;
}

function normalizeSeverity(
  raw: string | null,
  cvssScore: number | null,
): Severity | null {
  if (raw) {
    const key = raw.trim().toLowerCase() as Severity;
    if (SEVERITY_SET.has(key)) return key;
  }
  return severityFromCvss(cvssScore);
}

function parseCvss(node: unknown): { score: number | null; vector: string | null } {
  if (!node || typeof node !== "object") {
    return { score: null, vector: null };
  }
  const obj = node as Record<string, unknown>;
  const scoreRaw = textOf(obj.score);
  const score = scoreRaw != null ? Number(scoreRaw) : NaN;
  return {
    score: Number.isFinite(score) ? score : null,
    vector: textOf(obj.vector),
  };
}

function parseSoft(softNode: unknown): {
  vendors: string[];
  products: string[];
  affected: ParsedBduRecord["affected"];
} {
  const vendors: string[] = [];
  const products: string[] = [];
  const affected: ParsedBduRecord["affected"] = [];
  for (const soft of asArray(softNode)) {
    if (!soft || typeof soft !== "object") continue;
    const s = soft as Record<string, unknown>;
    const vendor = textOf(s.vendor) ?? "unknown";
    const product = textOf(s.product) ?? "unknown";
    const version = textOf(s.version) ?? undefined;
    vendors.push(vendor);
    products.push(product);
    affected.push({
      vendor,
      product,
      ...(version ? { versions: version } : {}),
    });
  }
  return {
    vendors: [...new Set(vendors)],
    products: [...new Set(products)],
    affected,
  };
}

function parseVulNode(node: unknown): ParsedBduRecord | null {
  if (!node || typeof node !== "object") return null;
  const vul = node as Record<string, unknown>;
  const bduId = textOf(vul.identifier);
  if (!bduId) return null;

  const cvss = parseCvss(vul.cvss);
  const softParent =
    vul.vulnerable_software &&
    typeof vul.vulnerable_software === "object"
      ? (vul.vulnerable_software as { soft?: unknown }).soft
      : undefined;
  const soft = parseSoft(softParent);

  const title = textOf(vul.name) ?? bduId;
  const description = textOf(vul.description) ?? "";
  const severity = normalizeSeverity(textOf(vul.severity), cvss.score);
  const cveRaw = Array.isArray(vul.cve)
    ? textOf(vul.cve[0])
    : textOf(vul.cve);
  const cveId = normalizeCve(cveRaw);

  return {
    bduId,
    title,
    description,
    severity,
    cvssScore: cvss.score,
    cvssVector: cvss.vector,
    cveId,
    vendors: soft.vendors,
    products: soft.products,
    affected: soft.affected,
    raw: vul,
  };
}

/**
 * Parse БДУ XML (`<vulnerabilities><vul>…`) into normalized records.
 * Broken nodes are skipped (logged) without failing the whole document.
 */
export function parseBduXml(xml: string): {
  records: ParsedBduRecord[];
  skipped: number;
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    isArray: (name) => name === "vul" || name === "soft" || name === "cve",
  });

  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    throw new Error(
      `BDU_XML_PARSE_FAILED: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const root = doc as {
    vulnerabilities?: { vul?: unknown };
  };
  const vulNodes = asArray(root?.vulnerabilities?.vul);

  const records: ParsedBduRecord[] = [];
  let skipped = 0;
  for (const node of vulNodes) {
    try {
      const parsed = parseVulNode(node);
      if (!parsed) {
        skipped += 1;
        logger.warn({ node }, "bdu parse: skipped vul without identifier");
        continue;
      }
      records.push(parsed);
    } catch (err) {
      skipped += 1;
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "bdu parse: skipped broken vul node",
      );
    }
  }

  return { records, skipped };
}
