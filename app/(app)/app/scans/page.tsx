import { ScansTable } from "@/components/scans/scans-table";
import { canCreateScan, type AppRole } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { listScans, parseScanListParams } from "@/lib/scans";

export default async function ScansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const role = (session.user.role ?? "viewer") as AppRole;
  const canCreate = canCreateScan(role);

  const raw = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const v of value) urlParams.append(key, v);
    } else if (value != null) {
      urlParams.set(key, value);
    }
  }

  const params = parseScanListParams(urlParams);
  const result = await listScans(params);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Scans</h1>
        <p className="text-muted-foreground text-sm">
          Queue discovery and vulnerability scans. Targets must be on the
          allowlist. Reports land under storage/reports.
        </p>
      </div>
      <ScansTable
        items={result.items}
        total={result.total}
        canCreate={canCreate}
      />
    </div>
  );
}
