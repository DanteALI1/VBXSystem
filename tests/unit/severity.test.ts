import { describe, expect, it } from "vitest";
import {
  compareSeverity,
  isAtLeast,
  parseSeverity,
  severityRank,
} from "@/lib/domain/severity";

describe("parseSeverity", () => {
  it("normalizes common aliases", () => {
    expect(parseSeverity("CRITICAL")).toBe("critical");
    expect(parseSeverity("crit")).toBe("critical");
    expect(parseSeverity("Med")).toBe("medium");
    expect(parseSeverity("moderate")).toBe("medium");
    expect(parseSeverity("informational")).toBe("info");
    expect(parseSeverity("none")).toBe("info");
  });

  it("returns unknown for null/empty/unrecognized", () => {
    expect(parseSeverity(null)).toBe("unknown");
    expect(parseSeverity(undefined)).toBe("unknown");
    expect(parseSeverity("")).toBe("unknown");
    expect(parseSeverity("banana")).toBe("unknown");
  });
});

describe("compareSeverity", () => {
  it("orders severities", () => {
    expect(compareSeverity("critical", "high")).toBeGreaterThan(0);
    expect(compareSeverity("low", "high")).toBeLessThan(0);
    expect(compareSeverity("medium", "medium")).toBe(0);
  });

  it("supports isAtLeast and severityRank", () => {
    expect(isAtLeast("high", "medium")).toBe(true);
    expect(isAtLeast("low", "medium")).toBe(false);
    expect(severityRank("critical")).toBeGreaterThan(severityRank("info"));
  });
});
