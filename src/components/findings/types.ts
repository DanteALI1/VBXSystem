import type { FindingStatus } from "@/lib/findings/status";
import type { Severity } from "@/lib/domain/severity";

export type FindingListItem = {
  id: string;
  title: string;
  status: FindingStatus;
  severity: Severity | null;
  assetId: string | null;
  assetName: string | null;
  serviceId: string | null;
  vulnerabilityId: string | null;
  cveId: string | null;
  bduId: string | null;
  scanJobId: string | null;
  scanJobType: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FindingsListResponse = {
  items: FindingListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type FindingsFilters = {
  q: string;
  status: string;
  severity: string;
  assetId: string;
};
