import type { ScanStatus, ScanType } from "@/db/schema";

export type ListScansParams = {
  page: number;
  pageSize: number;
  type?: ScanType;
  status?: ScanStatus;
};

export type ScanListItem = {
  id: string;
  type: ScanType;
  status: ScanStatus;
  target: string;
  options: Record<string, unknown> | null;
  error: string | null;
  createdBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type ScanListResponse = {
  items: ScanListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ScanDetail = ScanListItem & {
  findingsCount: number;
  reportDir: string | null;
};
