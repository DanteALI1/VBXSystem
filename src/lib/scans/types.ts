import type { Severity } from "@/lib/domain/severity";

export type ScanType = "nmap" | "nuclei" | "zap" | "openvas";

export type ScanJobStatus = "queued" | "running" | "succeeded" | "failed";

/** Draft produced by adapter.parse — ingest maps to Service / Finding rows. */
export type FindingDraft = {
  title: string;
  description?: string;
  severity?: Severity | null;
  cveId?: string | null;
  bduId?: string | null;
  host?: string;
  port?: number;
  protocol?: string;
  product?: string;
  version?: string;
  serviceName?: string;
  banner?: string;
  /** service = inventory from nmap; finding = vuln detection */
  kind?: "service" | "finding";
  rawEvidence?: Record<string, unknown>;
};

export type ScanJobContext = {
  id: string;
  type: ScanType;
  targets: string[];
  options: Record<string, unknown>;
  reportDir: string;
};

export type ScanStartResult = {
  reportPath: string;
  /** true when fixture/mock path used (binary missing or SCAN_ADAPTER_MODE=fixture) */
  usedFixture: boolean;
};

/**
 * Scanner adapter contract.
 * - start: run tool (or fixture) and write raw report under reportDir
 * - parse: turn report contents into FindingDraft[]
 */
export interface ScannerAdapter {
  readonly type: ScanType;
  validateOptions?(options: Record<string, unknown>): void;
  start(job: ScanJobContext): Promise<ScanStartResult>;
  parse(report: string, job: ScanJobContext): FindingDraft[];
}

export const ALLOWLIST_REJECTED = "ALLOWLIST_REJECTED";
export const NUCLEI_TEMPLATE_DENIED = "NUCLEI_TEMPLATE_DENIED";
export const SCANNER_NOT_IMPLEMENTED = "SCANNER_NOT_IMPLEMENTED";
