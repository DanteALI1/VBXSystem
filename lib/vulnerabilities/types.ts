import type { Severity, VulnSource } from "@/db/schema";

export type VulnerabilityListItem = {
  id: string;
  cveId: string | null;
  bduId: string | null;
  title: string;
  description: string | null;
  severity: Severity;
  cvssScore: number | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sources: VulnSource[];
};

export type VulnerabilitySourceDto = {
  id: string;
  source: VulnSource;
  externalUrl: string | null;
  syncedAt: string;
};

export type VulnerabilityDetail = Omit<VulnerabilityListItem, "sources"> & {
  sources: VulnerabilitySourceDto[];
};

export type VulnerabilityListResponse = {
  items: VulnerabilityListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListVulnerabilitiesParams = {
  q?: string;
  severity?: Severity[];
  source?: VulnSource;
  page: number;
  pageSize: number;
};

export const SEVERITIES: Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
  "unknown",
];

export const VULN_SOURCES: VulnSource[] = ["nvd", "bdu"];
