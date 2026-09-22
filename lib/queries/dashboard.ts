import type { SyncState, VulnSource } from "@/db/schema";

export type DashboardSyncState = {
  source: VulnSource;
  status: SyncState["status"];
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  cursor: string | null;
};

export type DashboardData = {
  vulnerabilities: number;
  assets: number;
  findingsOpen: number;
  sync: {
    nvd?: DashboardSyncState;
    bdu?: DashboardSyncState;
  };
};

export const dashboardQueryKey = ["dashboard"] as const;

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch("/api/dashboard");
  if (!res.ok) {
    throw new Error(`Failed to load dashboard (${res.status})`);
  }
  return res.json() as Promise<DashboardData>;
}
