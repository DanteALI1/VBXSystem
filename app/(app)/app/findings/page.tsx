import { Suspense } from "react";
import { FindingsFilters } from "@/components/findings/findings-filters";
import { FindingsTable } from "@/components/findings/findings-table";
import {
  canChangeFindingStatus,
  type AppRole,
} from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { listFindings, parseFindingListParams } from "@/lib/findings";

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const role = (session.user.role ?? "viewer") as AppRole;
  const canChangeStatus = canChangeFindingStatus(role);

  const raw = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const v of value) urlParams.append(key, v);
    } else if (value != null) {
      urlParams.set(key, value);
    }
  }

  const params = parseFindingListParams(urlParams);
  const result = await listFindings(params);

  const query = {
    q: params.q,
    status: params.status,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Findings</h1>
        <p className="text-muted-foreground text-sm">
          Scan results linked to assets. Change status when triaging.
        </p>
      </div>

      <Suspense fallback={null}>
        <FindingsFilters />
      </Suspense>

      <FindingsTable
        items={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        query={query}
        canChangeStatus={canChangeStatus}
        role={role}
      />
    </div>
  );
}
