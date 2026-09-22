import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  vulnerabilities,
  vulnerabilitySources,
} from "@/db/schema";
import { db } from "@/lib/db/client";
import { mapNvdCveItem, type NvdCveItem } from "@/lib/nvd/map";
import { upsertNvdVulnerability } from "@/lib/nvd/upsert";
import nvdFragment from "../fixtures/nvd-fragment.json";

const FIXTURE_CVE = "CVE-2099-0001";

describe("NVD upsert idempotent (TC-005)", () => {
  beforeAll(async () => {
    // Clean prior fixture rows
    const [existing] = await db
      .select()
      .from(vulnerabilities)
      .where(eq(vulnerabilities.cveId, FIXTURE_CVE))
      .limit(1);
    if (existing) {
      await db
        .delete(vulnerabilitySources)
        .where(eq(vulnerabilitySources.vulnerabilityId, existing.id));
      await db
        .delete(vulnerabilities)
        .where(eq(vulnerabilities.id, existing.id));
    }
  });

  afterAll(async () => {
    const [existing] = await db
      .select()
      .from(vulnerabilities)
      .where(eq(vulnerabilities.cveId, FIXTURE_CVE))
      .limit(1);
    if (existing) {
      await db
        .delete(vulnerabilitySources)
        .where(eq(vulnerabilitySources.vulnerabilityId, existing.id));
      await db
        .delete(vulnerabilities)
        .where(eq(vulnerabilities.id, existing.id));
    }
  });

  it("inserts once then updates the same cveId without duplicates", async () => {
    const item = nvdFragment.vulnerabilities[0] as NvdCveItem;
    const mapped = mapNvdCveItem(item);
    expect(mapped).not.toBeNull();

    const first = await upsertNvdVulnerability(mapped!);
    expect(first.action).toBe("inserted");
    expect(first.cveId).toBe(FIXTURE_CVE);

    const updatedMapped = {
      ...mapped!,
      description: "Updated description after second upsert.",
      title: "Updated title",
      modifiedAt: new Date("2099-01-25T00:00:00.000Z"),
      rawJson: JSON.stringify({
        ...item,
        cve: {
          ...item.cve,
          descriptions: [
            {
              lang: "en",
              value: "Updated description after second upsert.",
            },
          ],
        },
      }),
    };

    const second = await upsertNvdVulnerability(updatedMapped);
    expect(second.action).toBe("updated");
    expect(second.id).toBe(first.id);

    const rows = await db
      .select()
      .from(vulnerabilities)
      .where(eq(vulnerabilities.cveId, FIXTURE_CVE));
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe(
      "Updated description after second upsert.",
    );
    expect(rows[0].title).toBe("Updated title");

    const sources = await db
      .select()
      .from(vulnerabilitySources)
      .where(
        and(
          eq(vulnerabilitySources.vulnerabilityId, rows[0].id),
          eq(vulnerabilitySources.source, "nvd"),
        ),
      );
    expect(sources).toHaveLength(1);
    expect(sources[0].syncedAt).toBeInstanceOf(Date);
    expect(sources[0].rawJson).toContain("Updated description");
  });
});
