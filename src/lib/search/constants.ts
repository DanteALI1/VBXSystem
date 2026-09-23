export const ADVANCED_SEARCH_MAX_FIELDS_DEFAULT = Number(
  process.env.ADVANCED_SEARCH_MAX_FIELDS ?? 5,
);

export const VULN_PAGE_SIZE_DEFAULT = Number(
  process.env.VULN_PAGE_SIZE_DEFAULT ?? 50,
);

export const VULN_PAGE_SIZE_MAX = Number(process.env.VULN_PAGE_SIZE_MAX ?? 200);

export const SORT_FIELDS = ["updated", "cvss", "epss", "cveId"] as const;
export type VulnSortField = (typeof SORT_FIELDS)[number];

/** Map UI "updated" sort to localSyncedAt column. */
export function resolveSortColumn(sort: VulnSortField): string {
  switch (sort) {
    case "updated":
      return "localSyncedAt";
    case "cvss":
      return "cvssScore";
    case "epss":
      return "epssScore";
    case "cveId":
      return "cveId";
  }
}
