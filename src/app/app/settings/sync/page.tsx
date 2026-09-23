import { BduSyncControls } from "@/components/settings/bdu-sync-controls";

export default function SyncSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Sync
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          NVD and BDU synchronization controls.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">NVD</h2>
        <p className="text-xs text-zinc-500">
          NVD API sync is managed separately (Wave 2 NVD agent).
        </p>
      </section>

      <BduSyncControls />
    </div>
  );
}
