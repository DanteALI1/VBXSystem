import type { SearchField } from "./advanced-query";
import { SEARCH_FIELDS } from "./advanced-query";

/** AND-only Query Builder form row. */
export type QueryFormRow = {
  id: string;
  field: SearchField;
  op: ":" | "=" | ">" | ">=" | "<" | "<=";
  value: string;
};

export const QUERY_BUILDER_FIELDS: SearchField[] = [...SEARCH_FIELDS];

/**
 * Build an advanced query string from AND-only form rows.
 * Empty values are skipped. Output uses explicit AND between clauses.
 */
export function buildQueryFromForm(rows: QueryFormRow[]): string {
  const parts = rows
    .map((r) => {
      const v = r.value.trim();
      if (!v) return null;
      const needsQuotes = /\s/.test(v) && !(v.startsWith('"') && v.endsWith('"'));
      const value = needsQuotes ? `"${v.replace(/"/g, '\\"')}"` : v;
      return `${r.field}${r.op}${value}`;
    })
    .filter((p): p is string => Boolean(p));
  return parts.join(" AND ");
}

export function emptyQueryFormRow(id?: string): QueryFormRow {
  return {
    id: id ?? `row-${Math.random().toString(36).slice(2, 9)}`,
    field: "severity",
    op: ":",
    value: "",
  };
}
