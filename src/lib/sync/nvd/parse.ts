import type {
  NvdApiResponse,
  NvdCveItem,
  NvdMetricEntry,
  NvdVulnerabilityEnvelope,
  ParsedNvdVulnerability,
} from "./types";

function pickEnDescription(
  descriptions: { lang: string; value: string }[] | undefined,
): string {
  if (!descriptions?.length) return "";
  const en = descriptions.find((d) => d.lang?.toLowerCase() === "en");
  return (en ?? descriptions[0])?.value?.trim() ?? "";
}

function primaryMetric(
  entries: NvdMetricEntry[] | undefined,
): NvdMetricEntry | undefined {
  if (!entries?.length) return undefined;
  return (
    entries.find((e) => e.type === "Primary") ??
    entries.find((e) => e.source?.includes("nvd.nist.gov")) ??
    entries[0]
  );
}

function parseCpeParts(cpe: string): {
  vendor?: string;
  product?: string;
  version?: string;
} {
  // cpe:2.3:part:vendor:product:version:...
  const parts = cpe.split(":");
  if (parts.length < 5) return {};
  const vendor = parts[3] === "*" || parts[3] === "-" ? undefined : parts[3];
  const product = parts[4] === "*" || parts[4] === "-" ? undefined : parts[4];
  const version = parts[5] === "*" || parts[5] === "-" ? undefined : parts[5];
  return { vendor, product, version };
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function parseEpss(cve: NvdCveItem): number | null {
  if (typeof cve.epss === "number") return cve.epss;
  if (cve.epss && typeof cve.epss === "object" && typeof cve.epss.score === "number") {
    return cve.epss.score;
  }
  return null;
}

export function extractEnvelopes(
  response: NvdApiResponse,
): NvdVulnerabilityEnvelope[] {
  return response.vulnerabilities ?? response.results ?? [];
}

export function parseNvdCve(cve: NvdCveItem): ParsedNvdVulnerability {
  const description = pickEnDescription(cve.descriptions);
  const title = description
    ? description.length > 160
      ? `${description.slice(0, 157)}…`
      : description
    : cve.id;

  const v31 = primaryMetric(cve.metrics?.cvssMetricV31)?.cvssData;
  const v30 = primaryMetric(cve.metrics?.cvssMetricV30)?.cvssData;
  const v2 = primaryMetric(cve.metrics?.cvssMetricV2)?.cvssData;
  const v4 = primaryMetric(cve.metrics?.cvssMetricV40)?.cvssData;

  const preferred = v31 ?? v30;
  const cvssScore =
    preferred?.baseScore != null && Number.isFinite(preferred.baseScore)
      ? preferred.baseScore
      : null;
  const cvssVector = preferred?.vectorString ?? null;
  const sourceSeverity = preferred?.baseSeverity?.toLowerCase() ?? null;

  const cwes = uniq(
    (cve.weaknesses ?? []).flatMap((w) =>
      (w.description ?? [])
        .filter((d) => !d.lang || d.lang.toLowerCase() === "en")
        .map((d) => d.value.trim())
        .filter((v) => /^CWE-\d+/i.test(v)),
    ),
  );

  const cpes = uniq(
    (cve.configurations ?? []).flatMap((cfg) =>
      (cfg.nodes ?? []).flatMap((node) =>
        (node.cpeMatch ?? [])
          .filter((m) => m.vulnerable !== false && m.criteria)
          .map((m) => m.criteria as string),
      ),
    ),
  );

  const vendors: string[] = [];
  const products: string[] = [];
  const affected: ParsedNvdVulnerability["affected"] = [];

  for (const cpe of cpes) {
    const { vendor, product, version } = parseCpeParts(cpe);
    if (vendor) vendors.push(vendor);
    if (product) products.push(product);
    if (vendor && product) {
      affected.push({
        vendor,
        product,
        versions: version,
        cpe,
      });
    }
  }

  return {
    cveId: cve.id,
    title,
    description,
    cvssScore,
    cvssVector,
    cvssV2Score:
      v2?.baseScore != null && Number.isFinite(v2.baseScore) ? v2.baseScore : null,
    cvssV2Vector: v2?.vectorString ?? null,
    cvssV4Score:
      v4?.baseScore != null && Number.isFinite(v4.baseScore) ? v4.baseScore : null,
    cvssV4Vector: v4?.vectorString ?? null,
    sourceSeverity,
    epssScore: parseEpss(cve),
    kev: Boolean(cve.cisaExploitAdd),
    vendors: uniq(vendors),
    products: uniq(products),
    cwes,
    cpes,
    references: (cve.references ?? []).map((r) => ({
      url: r.url,
      source: r.source ?? "nvd",
      tags: r.tags,
    })),
    affected,
    publishedAt: cve.published ? new Date(cve.published) : null,
    updatedAt: cve.lastModified ? new Date(cve.lastModified) : null,
    raw: cve,
  };
}

export function parseNvdResponse(
  response: NvdApiResponse,
): ParsedNvdVulnerability[] {
  return extractEnvelopes(response)
    .map((env) => env.cve)
    .filter((cve): cve is NvdCveItem => Boolean(cve?.id))
    .map(parseNvdCve);
}
