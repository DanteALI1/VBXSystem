import type { Severity } from "@/db/schema";
import { parseSeverity } from "@/lib/domain/severity";

/** NVD CVE API 2.0 vulnerability item (subset). */
export type NvdCveItem = {
  cve: {
    id: string;
    published?: string;
    lastModified?: string;
    descriptions?: Array<{ lang?: string; value?: string }>;
    metrics?: {
      cvssMetricV31?: Array<{
        cvssData?: { baseScore?: number; baseSeverity?: string };
      }>;
      cvssMetricV30?: Array<{
        cvssData?: { baseScore?: number; baseSeverity?: string };
      }>;
      cvssMetricV2?: Array<{
        cvssData?: { baseScore?: number; baseSeverity?: string };
      }>;
    };
  };
};

export type NvdApiResponse = {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  vulnerabilities?: NvdCveItem[];
};

export type MappedNvdVulnerability = {
  cveId: string;
  title: string;
  description: string | null;
  severity: Severity;
  cvssScore: string | null;
  publishedAt: Date | null;
  modifiedAt: Date | null;
  externalUrl: string;
  rawJson: string;
};

function pickDescription(
  descriptions: NvdCveItem["cve"]["descriptions"],
): string | null {
  if (!descriptions?.length) return null;
  const en = descriptions.find((d) => d.lang?.toLowerCase() === "en");
  return (en ?? descriptions[0])?.value?.trim() || null;
}

function pickCvss(metrics: NvdCveItem["cve"]["metrics"]): {
  score: number | null;
  severity: string | null;
} {
  const v31 = metrics?.cvssMetricV31?.[0]?.cvssData;
  if (v31) {
    return {
      score: v31.baseScore ?? null,
      severity: v31.baseSeverity ?? null,
    };
  }
  const v30 = metrics?.cvssMetricV30?.[0]?.cvssData;
  if (v30) {
    return {
      score: v30.baseScore ?? null,
      severity: v30.baseSeverity ?? null,
    };
  }
  const v2 = metrics?.cvssMetricV2?.[0]?.cvssData;
  if (v2) {
    return {
      score: v2.baseScore ?? null,
      severity: v2.baseSeverity ?? null,
    };
  }
  return { score: null, severity: null };
}

export function mapNvdCveItem(item: NvdCveItem): MappedNvdVulnerability | null {
  const cveId = item.cve?.id?.trim();
  if (!cveId) return null;

  const description = pickDescription(item.cve.descriptions);
  const { score, severity: sevLabel } = pickCvss(item.cve.metrics);
  const severity = parseSeverity(sevLabel);
  const title = description
    ? description.length > 160
      ? `${description.slice(0, 157)}…`
      : description
    : cveId;

  return {
    cveId,
    title,
    description,
    severity,
    cvssScore: score == null ? null : score.toFixed(1),
    publishedAt: item.cve.published ? new Date(item.cve.published) : null,
    modifiedAt: item.cve.lastModified
      ? new Date(item.cve.lastModified)
      : null,
    externalUrl: `https://nvd.nist.gov/vuln/detail/${cveId}`,
    rawJson: JSON.stringify(item),
  };
}
