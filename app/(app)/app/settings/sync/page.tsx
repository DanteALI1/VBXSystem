import { SyncPanel } from "@/components/sync/sync-panel";
import type { AppRole } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

export default async function SyncSettingsPage() {
  const session = await requireSession();
  const role = (session.user.role ?? "viewer") as AppRole;
  const nvdSyncDays = Number(process.env.NVD_SYNC_DAYS ?? "30");
  const nvdSyncMode = (process.env.NVD_SYNC_MODE ?? "live").trim() || "live";

  return (
    <SyncPanel
      role={role}
      nvdSyncDays={Number.isFinite(nvdSyncDays) ? nvdSyncDays : 30}
      nvdSyncMode={nvdSyncMode}
    />
  );
}
