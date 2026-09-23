import { afterAll, describe, expect, it, vi } from "vitest";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets, findings, vulnerabilities } from "@/db/schema";
import { updateFindingStatus } from "@/lib/findings";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/auth/session";
import { GET } from "@/app/api/dashboard/route";
import { sessionFor } from "../helpers/session";

const getSessionMock = getSession as unknown as ReturnType<typeof vi.fn>;

describe("TC-016 Dashboard counters", () => {
  const createdAssetIds: string[] = [];
  const createdFindingIds: string[] = [];

  afterAll(async () => {
    for (const id of createdFindingIds) {
      await db.delete(findings).where(eq(findings.id, id));
    }
    for (const id of createdAssetIds) {
      await db.delete(assets).where(eq(assets.id, id));
    }
  });

  async function sqlCounts() {
    const [[vulnRow], [assetRow], [openRow]] = await Promise.all([
      db.select({ value: count() }).from(vulnerabilities),
      db.select({ value: count() }).from(assets),
      db
        .select({ value: count() })
        .from(findings)
        .where(eq(findings.status, "open")),
    ]);
    return {
      vulnerabilities: Number(vulnRow?.value ?? 0),
      assets: Number(assetRow?.value ?? 0),
      findingsOpen: Number(openRow?.value ?? 0),
    };
  }

  it("unauthenticated GET → 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET /api/dashboard counters match SQL aggregates", async () => {
    getSessionMock.mockResolvedValue(sessionFor("viewer"));
    const expected = await sqlCounts();

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      vulnerabilities: number;
      assets: number;
      findingsOpen: number;
      sync: Record<string, unknown>;
    };

    expect(body.vulnerabilities).toBe(expected.vulnerabilities);
    expect(body.assets).toBe(expected.assets);
    expect(body.findingsOpen).toBe(expected.findingsOpen);
    expect(body.sync).toBeTypeOf("object");
  });

  it("open→fixed decreases findingsOpen by 1", async () => {
    getSessionMock.mockResolvedValue(sessionFor("analyst"));

    const beforeRes = await GET();
    const before = (await beforeRes.json()) as { findingsOpen: number };

    const [asset] = await db
      .insert(assets)
      .values({
        hostname: `tc016-${Date.now()}.lab.local`,
        ip: "10.16.0.1",
        description: "tc016",
      })
      .returning();
    createdAssetIds.push(asset.id);

    const [finding] = await db
      .insert(findings)
      .values({
        assetId: asset.id,
        title: "tc016 open finding",
        severity: "high",
        status: "open",
      })
      .returning();
    createdFindingIds.push(finding.id);

    const midRes = await GET();
    const mid = (await midRes.json()) as { findingsOpen: number };
    expect(mid.findingsOpen).toBe(before.findingsOpen + 1);
    expect(mid.findingsOpen).toBe((await sqlCounts()).findingsOpen);

    await updateFindingStatus(finding.id, "fixed", "analyst");

    const afterRes = await GET();
    const after = (await afterRes.json()) as { findingsOpen: number };
    expect(after.findingsOpen).toBe(before.findingsOpen);
    expect(after.findingsOpen).toBe((await sqlCounts()).findingsOpen);
  });
});
