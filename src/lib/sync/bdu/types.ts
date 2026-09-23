import type { Severity } from "@/lib/domain/severity";

export type BduSyncMode = "download" | "upload";

export type ParsedBduRecord = {
  bduId: string;
  title: string;
  description: string;
  severity: Severity | null;
  cvssScore: number | null;
  cvssVector: string | null;
  cveId: string | null;
  vendors: string[];
  products: string[];
  affected: {
    vendor: string;
    product: string;
    versions?: string;
  }[];
  raw: unknown;
};

export type BduUpsertStats = {
  upserted: number;
  created: number;
  updated: number;
  linked: number;
  skipped: number;
  historyEntries: number;
};

export type BduSyncJobPayload = {
  mode: BduSyncMode;
  /** Absolute or cwd-relative path for upload mode */
  filePath?: string;
  /** Inline XML (tests / small payloads) */
  xml?: string;
  force?: boolean;
  requestedByUserId?: string;
  requestedAt?: string;
};

export type BduSyncResult = {
  mode: BduSyncMode;
  fileHash: string;
  skippedUnchanged: boolean;
  stats: BduUpsertStats;
};

export const DEFAULT_BDU_XML_URL =
  "https://bdu.fstec.ru/files/documents/vulxml.xml";
