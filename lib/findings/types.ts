import type { FindingStatus, ScanStatus, ScanType, Severity } from "@/db/schema";

export const FINDING_STATUSES: FindingStatus[] = [
  "open",
  "fixed",
  "accepted",
  "false_positive",
];

export type FindingAssetDto = {
  id: string;
  hostname: string;
  ip: string;
};

export type FindingScanJobDto = {
  id: string;
  type: ScanType;
  status: ScanStatus;
};

export type FindingListItem = {
  id: string;
  title: string;
  description: string | null;
  severity: Severity;
  status: FindingStatus;
  cveId: string | null;
  /** Linked catalog vulnerability (FK or resolved by matching cveId). */
  vulnerabilityId: string | null;
  asset: FindingAssetDto;
  scanJob: FindingScanJobDto | null;
  createdAt: string;
  updatedAt: string;
};

export type FindingListResponse = {
  items: FindingListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListFindingsParams = {
  status?: FindingStatus;
  q?: string;
  page: number;
  pageSize: number;
};
