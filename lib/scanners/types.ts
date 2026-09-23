import type { ScanJob, ScanType, Severity } from "@/db/schema";

/** Normalized finding produced by a scanner parse step. */
export type FindingDraft = {
  title: string;
  description?: string;
  severity: Severity;
  cveId?: string;
  assetId?: string;
  service?: {
    port: number;
    protocol: string;
    name?: string;
    product?: string;
    version?: string;
  };
  raw?: unknown;
};

export type ScanReport = {
  reportDir: string;
  rawPath: string;
  /** True when fixture/mock path was used instead of a real binary. */
  fixture: boolean;
  meta?: Record<string, unknown>;
};

export type ScanJobStartContext = {
  job: ScanJob;
  reportDir: string;
  options: Record<string, unknown>;
};

/**
 * Scanner adapter contract (ADR-003).
 * `start` writes raw report under reportDir; `parse` normalizes to FindingDraft[].
 */
export interface ScannerAdapter {
  readonly type: ScanType;
  start(ctx: ScanJobStartContext): Promise<ScanReport>;
  parse(report: ScanReport): Promise<FindingDraft[]>;
}

export type PersistScanResult = {
  servicesUpserted: number;
  findingsCreated: number;
  assetId: string | null;
};
