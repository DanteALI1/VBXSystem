import { AssetsTable } from "@/components/assets/assets-table";
import { canManageAssets, type AppRole } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { listAssets, parseAssetListParams } from "@/lib/assets";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const role = (session.user.role ?? "viewer") as AppRole;
  const canWrite = canManageAssets(role);

  const raw = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const v of value) urlParams.append(key, v);
    } else if (value != null) {
      urlParams.set(key, value);
    }
  }

  const params = parseAssetListParams(urlParams);
  const result = await listAssets(params);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Assets</h1>
        <p className="text-muted-foreground text-sm">
          Inventory of hosts. Services appear after discovery scans.
        </p>
      </div>
      <AssetsTable
        items={result.items}
        total={result.total}
        canWrite={canWrite}
      />
    </div>
  );
}
