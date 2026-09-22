import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  vulnerabilities,
  vulnerabilitySources,
} from "@/db/schema";
import { db } from "@/lib/db/client";
import { parseBduXml } from "@/lib/bdu/parse";
import { upsertBduVulnerability } from "@/lib/bdu/upsert";
import { upsertNvdVulnerability } from "@/lib/nvd/upsert";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "tests/fixtures/bdu-mini.xml",
);
const BDU_WITH_CVE = "BDU:2099-00001";
const BDU_NO_CVE = "BDU:2099-00002";
const LINKED_CVE = "CVE-2099-9101";

describe("BDU XML parse + CVE link (TC-007)", () => {
  const xml = readFileSync(FIXTURE_PATH, "utf8");

  it("parses fixture vul nodes and extracts CVE when present", () => {
    const { records, skipped } = parseBduXml(xml);
    expect(skipped).toBeGreaterThanOrEqual(1);
    expect(records.length).toBe(2);

    const withCve = records.find((r) => r.bduId === BDU_WITH_CVE);
    const noCve = records.find((r) => r.bduId === BDU_NO_CVE);

    expect(withCve).toBeDefined();
    expect(withCve!.cveId).toBe(LINKED_CVE);
    expect(withCve!.severity).toBe("critical");
    expect(withCve!.vendor).toBe("ExampleVendor");
    expect(withCve!.product).toBe("ExampleProduct");

    expect(noCve).toBeDefined();
    expect(noCve!.cveId).toBeNull();
    expect(noCve!.severity).toBe("medium");
  });

  describe("upsert links BDU to existing CVE row", () => {
    beforeAll(async () => {
      for (const id of [BDU_WITH_CVE, BDU_NO_CVE]) {
        const [row] = await db
          .select()
          .from(vulnerabilities)
          .where(eq(vulnerabilities.bduId, id))
          .limit(1);
        if (row) {
          await db
            .delete(vulnerabilitySources)
            .where(eq(vulnerabilitySources.vulnerabilityId, row.id));
          await db
            .delete(vulnerabilities)
            .where(eq(vulnerabilities.id, row.id));
        }
      }
      const [cveRow] = await db
        .select()
        .from(vulnerabilities)
        .where(eq(vulnerabilities.cveId, LINKED_CVE))
        .limit(1);
      if (cveRow) {
        await db
          .delete(vulnerabilitySources)
          .where(eq(vulnerabilitySources.vulnerabilityId, cveRow.id));
        await db
          .delete(vulnerabilities)
          .where(eq(vulnerabilities.id, cveRow.id));
      }

      await upsertNvdVulnerability({
        cveId: LINKED_CVE,
        title: "Pre-existing NVD row for BDU link test",
        description: "Created by bdu-parse unit test",
        severity: "high",
        cvssScore: "7.5",
        publishedAt: new Date("2099-01-01T00:00:00Z"),
        modifiedAt: new Date("2099-01-02T00:00:00Z"),
        externalUrl: `https://nvd.nist.gov/vuln/detail/${LINKED_CVE}`,
        rawJson: JSON.stringify({ cve: { id: LINKED_CVE } }),
      });
    });

    afterAll(async () => {
      for (const field of [
        { col: vulnerabilities.bduId, val: BDU_WITH_CVE },
        { col: vulnerabilities.bduId, val: BDU_NO_CVE },
        { col: vulnerabilities.cveId, val: LINKED_CVE },
      ] as const) {
        const rows = await db
          .select()
          .from(vulnerabilities)
          .where(eq(field.col, field.val));
        for (const row of rows) {
          await db
            .delete(vulnerabilitySources)
            .where(eq(vulnerabilitySources.vulnerabilityId, row.id));
          await db
            .delete(vulnerabilities)
            .where(eq(vulnerabilities.id, row.id));
        }
      }
    });

    it("sets bduId on existing CVE vulnerability and upserts bdu source", async () => {
      const { records } = parseBduXml(xml);
      const withCve = records.find((r) => r.bduId === BDU_WITH_CVE)!;
      const noCve = records.find((r) => r.bduId === BDU_NO_CVE)!;

      const linked = await upsertBduVulnerability(withCve);
      expect(linked.action).toBe("updated");
      expect(linked.cveId).toBe(LINKED_CVE);

      const [row] = await db
        .select()
        .from(vulnerabilities)
        .where(eq(vulnerabilities.cveId, LINKED_CVE))
        .limit(1);
      expect(row.bduId).toBe(BDU_WITH_CVE);

      const sources = await db
        .select()
        .from(vulnerabilitySources)
        .where(
          and(
            eq(vulnerabilitySources.vulnerabilityId, row.id),
            eq(vulnerabilitySources.source, "bdu"),
          ),
        );
      expect(sources).toHaveLength(1);

      const onlyBdu = await upsertBduVulnerability(noCve);
      expect(onlyBdu.action).toBe("inserted");
      expect(onlyBdu.cveId).toBeNull();

      const byBdu = await db
        .select()
        .from(vulnerabilities)
        .where(eq(vulnerabilities.bduId, BDU_NO_CVE));
      expect(byBdu).toHaveLength(1);
      expect(byBdu[0].cveId).toBeNull();
    });
  });
});
