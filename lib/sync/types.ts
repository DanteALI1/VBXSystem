export type SyncJobMode = "live" | "fixture";

export type NvdSyncJobData = {
  triggeredBy?: string;
  days?: number;
  force?: boolean;
  mode?: SyncJobMode;
};

export type BduSyncJobData = {
  triggeredBy?: string;
  uploadedPath?: string;
  force?: boolean;
  mode?: SyncJobMode;
};

export const NVD_QUEUE_NAME = "nvd-sync" as const;
export const BDU_QUEUE_NAME = "bdu-sync" as const;
export const SCAN_QUEUE_NAME = "scan" as const;
