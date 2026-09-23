import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseNucleiJsonl } from "@/lib/scanners/nuclei";

const fixture = readFileSync(
  join(process.cwd(), "tests/fixtures/nuclei-sample.jsonl"),
  "utf8",
);

describe("nuclei parse (TC-013)", () => {
  it("parses valid JSONL lines into findings and skips broken lines", () => {
    const drafts = parseNucleiJsonl(fixture);
    // 5 valid lines; 1 broken line skipped
    expect(drafts).toHaveLength(5);

    const titles = drafts.map((d) => d.title);
    expect(titles).toContain("Apache Log4j RCE");
    expect(titles).toContain("Missing Security Headers");
  });

  it("normalizes severity and CVE ids", () => {
    const drafts = parseNucleiJsonl(fixture);
    const log4j = drafts.find((d) => d.cveId === "CVE-2021-44228");
    expect(log4j).toBeTruthy();
    expect(log4j!.severity).toBe("critical");

    const medium = drafts.find((d) => d.title.includes("Weak TLS"));
    expect(medium?.severity).toBe("medium");

    const info = drafts.filter((d) => d.severity === "info");
    expect(info.length).toBeGreaterThanOrEqual(2);
  });
});
