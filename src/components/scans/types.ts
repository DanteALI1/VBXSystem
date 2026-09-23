export type ScanJobItem = {
  id: string;
  type: "nmap" | "nuclei" | "zap" | "openvas";
  status: "queued" | "running" | "succeeded" | "failed";
  targets: string[];
  options: Record<string, unknown>;
  errorMessage: string | null;
  reportPath: string | null;
  createdById: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScanCreateValues = {
  type: "nmap" | "nuclei";
  target: string;
  ports?: string;
  templates?: string;
};
