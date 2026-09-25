/** CVEQL filter builder helpers (Kibana/Datadog-style chips with AND/OR). */

import { FIELD_LABELS, fieldLabel } from "./fieldLabels";

export type FilterType = "enum" | "number" | "bool" | "string" | "date";

export type FilterJoin = "and" | "or";

export type FilterDef = {
  field: string;
  label: string;
  type: FilterType;
  ops: string[];
  options?: { value: string; label: string }[];
  /** Short hint in the add-filter picker */
  hint?: string;
};

export type ActiveFilter = {
  id: string;
  field: string;
  op: string;
  value: string;
  /**
   * Boolean relation with the previous filter (ignored for the first).
   * Matches CVEQL precedence: `and` binds tighter than `or`.
   */
  join?: FilterJoin;
};

export const FILTER_DEFS: FilterDef[] = [
  {
    field: "severity",
    label: FIELD_LABELS.severity,
    type: "enum",
    ops: ["=", "!=", "in"],
    options: [
      { value: "CRITICAL", label: "CRITICAL" },
      { value: "HIGH", label: "HIGH" },
      { value: "MEDIUM", label: "MEDIUM" },
      { value: "LOW", label: "LOW" },
    ],
    hint: "CRITICAL / HIGH / …",
  },
  {
    field: "cvss_score",
    label: FIELD_LABELS.cvss_score,
    type: "number",
    ops: [">=", ">", "<=", "<", "="],
    hint: "0–10",
  },
  {
    field: "epss_scores.score",
    label: FIELD_LABELS["epss_scores.score"],
    type: "number",
    ops: [">=", ">", "<=", "<", "="],
    /** UI принимает проценты 0–100; в CVEQL уходит 0–1 */
    hint: "0–100%",
  },
  {
    field: "is_cisa_kev",
    label: FIELD_LABELS.is_cisa_kev,
    type: "bool",
    ops: ["="],
  },
  {
    field: "has_bdu",
    label: FIELD_LABELS.has_bdu,
    type: "bool",
    ops: ["="],
  },
  {
    field: "is_remote",
    label: FIELD_LABELS.is_remote,
    type: "bool",
    ops: ["="],
  },
  {
    field: "published",
    label: FIELD_LABELS.published,
    type: "date",
    ops: [">=", ">", "<=", "<", "="],
  },
  {
    field: "modified",
    label: FIELD_LABELS.modified,
    type: "date",
    ops: [">=", ">", "<=", "<", "="],
  },
  {
    field: "id",
    label: FIELD_LABELS.id,
    type: "string",
    ops: ["=", "~", "!="],
    hint: "CVE-2024-…",
  },
  {
    field: "title",
    label: FIELD_LABELS.title,
    type: "string",
    ops: ["~", "=", "!="],
  },
  {
    field: "description",
    label: FIELD_LABELS.description,
    type: "string",
    ops: ["~", "=", "!="],
  },
  {
    field: "products.vendor.name",
    label: FIELD_LABELS["products.vendor.name"],
    type: "string",
    ops: ["~", "=", "in"],
  },
  {
    field: "affected.app",
    label: FIELD_LABELS["affected.app"],
    type: "string",
    ops: ["~", "=", "in"],
    hint: "приложение / продукт",
  },
  {
    field: "affected.os",
    label: FIELD_LABELS["affected.os"],
    type: "string",
    ops: ["~", "=", "in"],
    hint: "ОС (не версии ПО)",
  },
  {
    field: "affected.version",
    label: FIELD_LABELS["affected.version"],
    type: "string",
    ops: ["~", "=", "in"],
    hint: "версии ПО, не ОС",
  },
  {
    field: "bdu.id",
    label: FIELD_LABELS["bdu.id"],
    type: "string",
    ops: ["=", "~", "in"],
  },
  {
    field: "status",
    label: FIELD_LABELS.status,
    type: "string",
    ops: ["=", "!=", "~"],
  },
  {
    field: "source",
    label: FIELD_LABELS.source,
    type: "string",
    ops: ["=", "!=", "~"],
  },
];

export function defFor(field: string): FilterDef | undefined {
  return FILTER_DEFS.find((d) => d.field === field);
}

export function labelForField(field: string): string {
  return fieldLabel(field, defFor(field)?.label || field);
}

function normalizeEpssInput(raw: string): string {
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n)) return raw.trim();
  // Filter chips use percent 0–100 (same as the column). 70 → 0.70
  return String(n / 100);
}

function quoteValue(def: FilterDef, op: string, raw: string, field?: string): string {
  const v = raw.trim();
  if (def.type === "bool") {
    return v === "true" || v === "1" ? "true" : "false";
  }
  if (def.type === "number") {
    if (field === "epss_scores.score") return normalizeEpssInput(v);
    return v;
  }
  if (op === "in") {
    const parts = v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `"${s.replace(/"/g, '\\"')}"`);
    return `(${parts.join(", ")})`;
  }
  return `"${v.replace(/"/g, '\\"')}"`;
}

export function isFilterComplete(f: ActiveFilter): boolean {
  return Boolean(f.field && f.op && String(f.value).trim() !== "" && defFor(f.field));
}

/** Build CVEQL from filter chips. Joins use each chip's `join` (default and). */
export function composeCveql(filters: ActiveFilter[]): string {
  const clauses: { expr: string; join: FilterJoin }[] = [];
  for (const f of filters) {
    if (!isFilterComplete(f)) continue;
    const def = defFor(f.field)!;
    clauses.push({
      expr: `${f.field} ${f.op} ${quoteValue(def, f.op, f.value, f.field)}`,
      join: f.join === "or" ? "or" : "and",
    });
  }
  if (!clauses.length) return 'id ~ "CVE"';

  let out = clauses[0].expr;
  for (let i = 1; i < clauses.length; i++) {
    out += ` ${clauses[i].join} ${clauses[i].expr}`;
  }
  return out;
}

export function newFilterId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeFilter(
  field: string,
  patch: Partial<Pick<ActiveFilter, "op" | "value" | "join">> = {},
): ActiveFilter | null {
  const def = defFor(field);
  if (!def) return null;
  return {
    id: newFilterId(),
    field,
    op: patch.op || def.ops[0],
    value:
      patch.value ??
      (def.type === "bool" ? "true" : def.type === "enum" ? def.options?.[0]?.value || "" : ""),
    join: patch.join || "and",
  };
}

/** Upsert a single-field quick filter: replace matching field, keep others + join and. */
export function upsertFieldFilter(
  filters: ActiveFilter[],
  field: string,
  value: string | null,
  op?: string,
): ActiveFilter[] {
  const rest = filters.filter((f) => f.field !== field);
  if (value == null || value === "") return rest;
  const made = makeFilter(field, { value, op, join: "and" });
  return made ? [...rest, made] : rest;
}
