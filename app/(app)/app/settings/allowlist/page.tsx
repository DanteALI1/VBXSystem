import { AllowlistTable } from "@/components/allowlist/allowlist-table";
import { canManageAllowlist, type AppRole } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { listAllowlist, parseAllowlistListParams } from "@/lib/allowlist";

export default async function AllowlistSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const role = (session.user.role ?? "viewer") as AppRole;
  const canWrite = canManageAllowlist(role);

  const raw = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const v of value) urlParams.append(key, v);
    } else if (value != null) {
      urlParams.set(key, value);
    }
  }

  const params = parseAllowlistListParams(urlParams);
  const result = await listAllowlist(params);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Allowlist</h1>
        <p className="text-muted-foreground text-sm">
          Scan targets must match an enabled CIDR or URL rule. Admin-only
          edits.
        </p>
      </div>
      <AllowlistTable
        items={result.items}
        total={result.total}
        canWrite={canWrite}
      />
    </div>
  );
}
