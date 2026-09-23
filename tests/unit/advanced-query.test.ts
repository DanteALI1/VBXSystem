import { describe, expect, it } from "vitest";
import { parseAdvancedQuery } from "@/lib/search/advanced-query";

describe("parseAdvancedQuery (stub Wave 0)", () => {
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

  it("rejects unknown fields", () => {
    const r = parseAdvancedQuery("foo:bar");
    expect(r.ok).toBe(false);
  });

  it("enforces max fields", () => {
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
});
