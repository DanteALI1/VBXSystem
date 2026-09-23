import {
  and,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { vulnerabilities } from "@/db/schema";
import type {
  ComparisonOp,
  FieldClause,
  QueryClause,
} from "./advanced-query";

export type FacetFilters = {
  severity?: string[];
  source?: ("nvd" | "bdu")[];
  kev?: boolean;
  cvssMin?: number;
  cvssMax?: number;
  vendor?: string;
  product?: string;
  tag?: string;
  updatedFrom?: string;
  updatedTo?: string;
  keyword?: string;
};

function escapeLike(s: string): string {
  return s.replace(/([%_\\])/g, "\\$1");
}

function parseBool(v: string): boolean | null {
  const t = v.toLowerCase();
  if (["true", "1", "yes"].includes(t)) return true;
  if (["false", "0", "no"].includes(t)) return false;
  return null;
}

function parseNumberRange(
  value: string,
): { min?: number; max?: number; eq?: number } {
  if (value.includes("..")) {
    const [a, b] = value.split("..");
    return {
      min: a ? Number(a) : undefined,
      max: b ? Number(b) : undefined,
    };
  }
  const dash = value.match(/^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/);
  if (dash) {
    return { min: Number(dash[1]), max: Number(dash[2]) };
  }
  const n = Number(value);
  if (!Number.isNaN(n)) return { eq: n };
  return {};
}

function parseDateRange(value: string): { from?: Date; to?: Date } {
  if (value.includes("..")) {
    const [a, b] = value.split("..");
    return {
      from: a ? new Date(a) : undefined,
      to: b ? new Date(`${b}T23:59:59.999Z`) : undefined,
    };
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return { from: d, to: new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1) };
  }
  return {};
}

function cmpNumeric(
  column: typeof vulnerabilities.cvssScore | typeof vulnerabilities.epssScore,
  op: ComparisonOp,
  value: string,
): SQL | undefined {
  const range = parseNumberRange(value);
  if (op === ":" || op === "=") {
    if (range.min != null && range.max != null) {
      return and(
        gte(column, String(range.min)),
        lte(column, String(range.max)),
      );
    }
    if (range.eq != null) return eq(column, String(range.eq));
  }
  const n = Number(value);
  if (Number.isNaN(n)) return undefined;
  if (op === ">" || op === ">=") return gte(column, String(n));
  if (op === "<" || op === "<=") return lte(column, String(n));
  return eq(column, String(n));
}

function cmpDate(
  column:
    | typeof vulnerabilities.createdAt
    | typeof vulnerabilities.updatedAt
    | typeof vulnerabilities.localSyncedAt,
  op: ComparisonOp,
  value: string,
): SQL | undefined {
  const range = parseDateRange(value);
  if ((op === ":" || op === "=") && (range.from || range.to)) {
    const parts: SQL[] = [];
    if (range.from) parts.push(gte(column, range.from));
    if (range.to) parts.push(lte(column, range.to));
    return parts.length ? and(...parts) : undefined;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (op === ">" || op === ">=") return gte(column, d);
  if (op === "<" || op === "<=") return lte(column, d);
  return and(
    gte(column, d),
    lte(column, new Date(d.getTime() + 86400000 - 1)),
  );
}

function jsonbTextContains(
  column: typeof vulnerabilities.vendors | typeof vulnerabilities.products,
  needle: string,
): SQL {
  return sql`exists (
    select 1 from jsonb_array_elements_text(${column}) as elem
    where elem ilike ${"%" + escapeLike(needle) + "%"}
  )`;
}

function sourceExists(source: "nvd" | "bdu"): SQL {
  return sql`exists (
    select 1 from vulnerability_sources vs
    where vs.vulnerability_id = ${vulnerabilities.id}
      and vs.source = ${source}
  )`;
}

function tagExists(tagName: string): SQL {
  return sql`exists (
    select 1 from vulnerability_tag_links vtl
    inner join vulnerability_tags vt on vt.id = vtl.tag_id
    where vtl.vulnerability_id = ${vulnerabilities.id}
      and lower(vt.name) = lower(${tagName})
  )`;
}

export function fieldClauseToSql(clause: FieldClause): SQL | undefined {
  const { field, op, value } = clause;
  switch (field) {
    case "cve":
      return ilike(vulnerabilities.cveId, `%${escapeLike(value)}%`);
    case "bdu":
      return ilike(vulnerabilities.bduId, `%${escapeLike(value)}%`);
    case "description":
      return or(
        ilike(vulnerabilities.description, `%${escapeLike(value)}%`),
        ilike(vulnerabilities.title, `%${escapeLike(value)}%`),
      );
    case "vendor":
      return jsonbTextContains(vulnerabilities.vendors, value);
    case "product":
      return jsonbTextContains(vulnerabilities.products, value);
    case "cvss31":
      return cmpNumeric(vulnerabilities.cvssScore, op, value);
    case "severity":
      return eq(
        vulnerabilities.severity,
        value.toLowerCase() as "none" | "low" | "medium" | "high" | "critical",
      );
    case "kev": {
      const b = parseBool(value);
      return b == null ? undefined : eq(vulnerabilities.kev, b);
    }
    case "epss":
      return cmpNumeric(vulnerabilities.epssScore, op, value);
    case "source": {
      const s = value.toLowerCase();
      if (s !== "nvd" && s !== "bdu") return undefined;
      return sourceExists(s);
    }
    case "tag":
      return tagExists(value);
    case "created":
      return cmpDate(vulnerabilities.createdAt, op, value);
    case "updated":
      return cmpDate(vulnerabilities.localSyncedAt, op, value);
    default:
      return undefined;
  }
}

export function astToSql(ast: QueryClause | null): SQL | undefined {
  if (!ast) return undefined;
  if (ast.type === "field") return fieldClauseToSql(ast);
  const parts = ast.clauses
    .map((c) => astToSql(c))
    .filter((c): c is SQL => Boolean(c));
  if (parts.length === 0) return undefined;
  if (ast.type === "and") return and(...parts);
  return or(...parts);
}

export function facetsToSql(facets: FacetFilters): SQL | undefined {
  const parts: SQL[] = [];

  if (facets.keyword?.trim()) {
    const k = escapeLike(facets.keyword.trim());
    parts.push(
      or(
        ilike(vulnerabilities.description, `%${k}%`),
        ilike(vulnerabilities.title, `%${k}%`),
        ilike(vulnerabilities.cveId, `%${k}%`),
        ilike(vulnerabilities.bduId, `%${k}%`),
      )!,
    );
  }

  if (facets.severity?.length) {
    parts.push(
      or(
        ...facets.severity.map((s) =>
          eq(
            vulnerabilities.severity,
            s.toLowerCase() as
              | "none"
              | "low"
              | "medium"
              | "high"
              | "critical",
          ),
        ),
      )!,
    );
  }

  if (facets.kev !== undefined) {
    parts.push(eq(vulnerabilities.kev, facets.kev));
  }

  if (facets.cvssMin != null) {
    parts.push(gte(vulnerabilities.cvssScore, String(facets.cvssMin)));
  }
  if (facets.cvssMax != null) {
    parts.push(lte(vulnerabilities.cvssScore, String(facets.cvssMax)));
  }

  if (facets.vendor?.trim()) {
    parts.push(jsonbTextContains(vulnerabilities.vendors, facets.vendor.trim()));
  }
  if (facets.product?.trim()) {
    parts.push(
      jsonbTextContains(vulnerabilities.products, facets.product.trim()),
    );
  }

  if (facets.tag?.trim()) {
    parts.push(tagExists(facets.tag.trim()));
  }

  if (facets.source?.length) {
    const sourceParts = facets.source.map((s) => sourceExists(s));
    parts.push(or(...sourceParts)!);
  }

  if (facets.updatedFrom) {
    const d = new Date(facets.updatedFrom);
    if (!Number.isNaN(d.getTime())) {
      parts.push(gte(vulnerabilities.localSyncedAt, d));
    }
  }
  if (facets.updatedTo) {
    const d = new Date(facets.updatedTo);
    if (!Number.isNaN(d.getTime())) {
      parts.push(lte(vulnerabilities.localSyncedAt, d));
    }
  }

  if (parts.length === 0) return undefined;
  return and(...parts);
}

export function combineFilters(
  ...filters: (SQL | undefined)[]
): SQL | undefined {
  const parts = filters.filter((f): f is SQL => Boolean(f));
  if (parts.length === 0) return undefined;
  return and(...parts);
}
