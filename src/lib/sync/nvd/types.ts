/** NVD CVE API 2.0 shapes (subset used by sync). */

export type NvdCvssData = {
  version?: string;
  vectorString?: string;
  baseScore?: number;
  baseSeverity?: string;
};

export type NvdMetricEntry = {
  source?: string;
  type?: string;
  cvssData?: NvdCvssData;
};

export type NvdCveItem = {
  id: string;
  published?: string;
  lastModified?: string;
  descriptions?: { lang: string; value: string }[];
  metrics?: {
    cvssMetricV2?: NvdMetricEntry[];
    cvssMetricV30?: NvdMetricEntry[];
    cvssMetricV31?: NvdMetricEntry[];
    cvssMetricV40?: NvdMetricEntry[];
  };
  weaknesses?: { description?: { lang: string; value: string }[] }[];
  configurations?: {
    nodes?: {
      cpeMatch?: { vulnerable?: boolean; criteria?: string }[];
    }[];
  }[];
  references?: { url: string; source?: string; tags?: string[] }[];
  /** CISA KEV fields when present on NVD payload */
  cisaExploitAdd?: string;
  cisaActionDue?: string;
  cisaRequiredAction?: string;
  cisaVulnerabilityName?: string;
  /** Optional enrichment (not always present on public API) */
  epss?: { score?: number } | number;
};

export type NvdVulnerabilityEnvelope = {
  cve: NvdCveItem;
};

export type NvdApiResponse = {
  resultsPerPage?: number;
  startIndex?: number;
  totalResults?: number;
  format?: string;
  version?: string;
  timestamp?: string;
  /** Official NVD 2.0 field */
  vulnerabilities?: NvdVulnerabilityEnvelope[];
  /** Fixture / legacy alias used by seed */
  results?: NvdVulnerabilityEnvelope[];
};

export type NvdSyncMode = "incremental" | "full";

export type NvdSyncJobPayload = {
  mode?: NvdSyncMode;
  lastModStartDate?: string;
  lastModEndDate?: string;
  /** Point update for a single CVE */
  cveId?: string;
  requestedByUserId?: string;
  requestedAt?: string;
};

export type NvdQueryParams = {
  startIndex?: number;
  resultsPerPage?: number;
  lastModStartDate?: string;
  lastModEndDate?: string;
  cveId?: string;
};

export type ParsedNvdVulnerability = {
  cveId: string;
  title: string;
  description: string;
  cvssScore: number | null;
  cvssVector: string | null;
  cvssV2Score: number | null;
  cvssV2Vector: string | null;
  cvssV4Score: number | null;
  cvssV4Vector: string | null;
  sourceSeverity: string | null;
  epssScore: number | null;
  kev: boolean;
  vendors: string[];
  products: string[];
  cwes: string[];
  cpes: string[];
  references: { url: string; source?: string; tags?: string[] }[];
  affected: {
    vendor: string;
    product: string;
    versions?: string;
    cpe?: string;
  }[];
  publishedAt: Date | null;
  updatedAt: Date | null;
  raw: NvdCveItem;
};

export type NvdSyncResult = {
  upserted: number;
  unchanged: number;
  pages: number;
  mode: NvdSyncMode;
  lastModStartDate?: string;
  lastModEndDate?: string;
};
