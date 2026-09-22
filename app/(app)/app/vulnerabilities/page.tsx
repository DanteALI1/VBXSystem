import { Suspense } from "react";
import { VulnerabilitiesFilters } from "@/components/vulnerabilities/vulnerabilities-filters";
import { VulnerabilitiesTable } from "@/components/vulnerabilities/vulnerabilities-table";
import { requireSession } from "@/lib/auth/session";
import { listVulnerabilities, parseListParams } from "@/lib/vulnerabilities";

export default async function VulnerabilitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();

  const raw = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const v of value) urlParams.append(key, v);
    } else if (value != null) {
      urlParams.set(key, value);
    }
  }

  const params = parseListParams(urlParams);
  const result = await listVulnerabilities(params);

  const query = {
    q: params.q,
    severity: params.severity?.join(","),
    source: params.source,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Vulnerabilities</h1>
        <p className="text-muted-foreground text-sm">
          Catalog from NVD and BDU. Filter by severity, source, or identifier.
        </p>
      </div>

      <Suspense fallback={null}>
        <VulnerabilitiesFilters />
      </Suspense>

      <VulnerabilitiesTable
        items={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        query={query}
      />
    </div>
  );
}
