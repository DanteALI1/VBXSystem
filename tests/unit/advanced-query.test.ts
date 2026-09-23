import { describe, expect, it } from "vitest";
import { parseAdvancedQuery } from "@/lib/search/advanced-query";
import { buildQueryFromForm, emptyQueryFormRow } from "@/lib/search/query-form";

describe("parseAdvancedQuery", () => {
  it("parses single field clause", () => {
    const r = parseAdvancedQuery("severity:critical");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fieldCount).toBe(1);
      expect(r.ast).toMatchObject({
        type: "field",
        field: "severity",
        op: ":",
        value: "critical",
      });
    }
  });

  it("parses AND of two fields", () => {
    const r = parseAdvancedQuery("severity:high AND kev:true");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fieldCount).toBe(2);
      expect(r.ast?.type).toBe("and");
    }
  });

  it("parses OR groups", () => {
    const r = parseAdvancedQuery("cve:CVE-2024 OR cve:CVE-2023");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ast?.type).toBe("or");
  });

  it("parses quoted description", () => {
    const r = parseAdvancedQuery('description:"remote code"');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ast).toMatchObject({
        type: "field",
        field: "description",
        value: "remote code",
      });
    }
  });

  it("rejects unknown fields", () => {
    const r = parseAdvancedQuery("foo:bar");
    expect(r.ok).toBe(false);
  });

  it("enforces max fields (ADVANCED_SEARCH_MAX_FIELDS)", () => {
    const r = parseAdvancedQuery(
      "cve:CVE-2024-1 AND severity:high AND kev:true AND epss:>0.5 AND source:nvd AND vendor:apache",
      5,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Too many fields/);
  });

  it("treats bare keyword as description", () => {
    const r = parseAdvancedQuery("overflow");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ast).toMatchObject({
        type: "field",
        field: "description",
        value: "overflow",
      });
    }
  });

  it("returns empty AST for blank input", () => {
    const r = parseAdvancedQuery("   ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ast).toBeNull();
      expect(r.fieldCount).toBe(0);
    }
  });
});

describe("buildQueryFromForm (AND-only Query Builder)", () => {
  it("joins filled rows with AND", () => {
    const rows = [
      { ...emptyQueryFormRow("a"), field: "severity" as const, op: ":" as const, value: "critical" },
      { ...emptyQueryFormRow("b"), field: "kev" as const, op: ":" as const, value: "true" },
    ];
    expect(buildQueryFromForm(rows)).toBe("severity:critical AND kev:true");
  });

  it("skips empty values and quotes phrases", () => {
    const rows = [
      { ...emptyQueryFormRow("a"), field: "description" as const, op: ":" as const, value: "remote code" },
      { ...emptyQueryFormRow("b"), field: "vendor" as const, op: ":" as const, value: "" },
    ];
    expect(buildQueryFromForm(rows)).toBe('description:"remote code"');
  });
});
