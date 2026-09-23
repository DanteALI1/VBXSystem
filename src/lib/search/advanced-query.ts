import { z } from "zod";

/**
 * Advanced search parser (OpenCVE-like subset).
 * Fields: cve, bdu, description, vendor, product, cvss31, severity, kev, epss, source, tag, created, updated
 * Ops: : = > >= < <= ; AND OR ( )
 * Dates: YYYY-MM-DD or relative 7d / 1m
 * Field limit: ADVANCED_SEARCH_MAX_FIELDS (default 5)
 */

export const SEARCH_FIELDS = [
  "cve",
  "bdu",
  "description",
  "vendor",
  "product",
  "cvss31",
  "severity",
  "kev",
  "epss",
  "source",
  "tag",
  "created",
  "updated",
] as const;

export type SearchField = (typeof SEARCH_FIELDS)[number];

export type ComparisonOp = ":" | "=" | ">" | ">=" | "<" | "<=";

export type FieldClause = {
  type: "field";
  field: SearchField;
  op: ComparisonOp;
  value: string;
};

export type AndClause = { type: "and"; clauses: QueryClause[] };
export type OrClause = { type: "or"; clauses: QueryClause[] };
export type QueryClause = FieldClause | AndClause | OrClause;

export type ParseResult =
  | { ok: true; ast: QueryClause | null; fieldCount: number }
  | { ok: false; error: string };

const fieldSet = new Set<string>(SEARCH_FIELDS);

const FIELD_RE =
  /\b(cve|bdu|description|vendor|product|cvss31|severity|kev|epss|source|tag|created|updated)\s*(:|=|>=|<=|>|<)\s*("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s()]+)/gi;

function stripQuotes(v: string): string {
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function countFields(ast: QueryClause | null): number {
  if (!ast) return 0;
  if (ast.type === "field") return 1;
  return ast.clauses.reduce((n, c) => n + countFields(c), 0);
}

/**
 * MVP parser: extracts field clauses and combines with AND/OR at top level.
 * Parentheses grouping supported for simple OR groups.
 */
export function parseAdvancedQuery(
  input: string,
  maxFields = Number(process.env.ADVANCED_SEARCH_MAX_FIELDS ?? 5),
): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, ast: null, fieldCount: 0 };
  }

  // Reject unknown field-looking tokens like foo:bar
  const unknown = [...trimmed.matchAll(/\b([a-zA-Z_][\w]*)\s*([:=><])/g)].filter(
    (m) => !fieldSet.has(m[1].toLowerCase()) && !["and", "or"].includes(m[1].toLowerCase()),
  );
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown field: ${unknown[0][1]}. Allowed: ${SEARCH_FIELDS.join(", ")}`,
    };
  }

  const orParts = splitTopLevel(trimmed, "OR");
  if (orParts.length > 1) {
    const clauses: QueryClause[] = [];
    for (const part of orParts) {
      const inner = parseAdvancedQuery(part, maxFields);
      if (!inner.ok) return inner;
      if (inner.ast) clauses.push(inner.ast);
    }
    const ast: OrClause = { type: "or", clauses };
    const fieldCount = countFields(ast);
    if (fieldCount > maxFields) {
      return {
        ok: false,
        error: `Too many fields (${fieldCount}). Max is ${maxFields} (ADVANCED_SEARCH_MAX_FIELDS).`,
      };
    }
    return { ok: true, ast, fieldCount };
  }

  const andParts = splitTopLevel(trimmed, "AND");
  if (andParts.length > 1) {
    const clauses: QueryClause[] = [];
    for (const part of andParts) {
      const inner = parseAdvancedQuery(part, maxFields);
      if (!inner.ok) return inner;
      if (inner.ast) clauses.push(inner.ast);
    }
    const ast: AndClause = { type: "and", clauses };
    const fieldCount = countFields(ast);
    if (fieldCount > maxFields) {
      return {
        ok: false,
        error: `Too many fields (${fieldCount}). Max is ${maxFields} (ADVANCED_SEARCH_MAX_FIELDS).`,
      };
    }
    return { ok: true, ast, fieldCount };
  }

  // unwrap parentheses
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return parseAdvancedQuery(trimmed.slice(1, -1), maxFields);
  }

  const matches = [...trimmed.matchAll(FIELD_RE)];
  if (matches.length === 0) {
    // keyword-only — treat as description contains
    const ast: FieldClause = {
      type: "field",
      field: "description",
      op: ":",
      value: stripQuotes(trimmed),
    };
    return { ok: true, ast, fieldCount: 1 };
  }

  if (matches.length > 1) {
    // implicit AND of adjacent field clauses
    const clauses: FieldClause[] = matches.map((m) => ({
      type: "field" as const,
      field: m[1].toLowerCase() as SearchField,
      op: m[2] as ComparisonOp,
      value: stripQuotes(m[3]),
    }));
    const ast: AndClause = { type: "and", clauses };
    const fieldCount = clauses.length;
    if (fieldCount > maxFields) {
      return {
        ok: false,
        error: `Too many fields (${fieldCount}). Max is ${maxFields} (ADVANCED_SEARCH_MAX_FIELDS).`,
      };
    }
    return { ok: true, ast, fieldCount };
  }

  const m = matches[0];
  const ast: FieldClause = {
    type: "field",
    field: m[1].toLowerCase() as SearchField,
    op: m[2] as ComparisonOp,
    value: stripQuotes(m[3]),
  };
  return { ok: true, ast, fieldCount: 1 };
}

function splitTopLevel(input: string, op: "AND" | "OR"): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  const tokens = input.split(/(\s+)/);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    for (const ch of tok) {
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && tok.trim().toUpperCase() === op) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += tok;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length > 1 ? parts : [input];
}

export const advancedQuerySchema = z.object({
  q: z.string().max(2000).optional(),
  maxFields: z.number().int().positive().optional(),
});
