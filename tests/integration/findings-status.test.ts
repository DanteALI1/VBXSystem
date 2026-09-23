import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets, findings } from "@/db/schema";
import {
  listFindings,
  updateFindingStatus,
  updateFindingStatusSchema,
} from "@/lib/findings";
import { FindingTransitionError } from "@/lib/findings/transitions";
import { AuthError } from "@/lib/auth/roles";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/auth/session";
import { GET as listGet } from "@/app/api/findings/route";
import { PATCH } from "@/app/api/findings/[id]/route";

const getSessionMock = getSession as unknown as ReturnType<typeof vi.fn>;

function sessionFor(role: "admin" | "analyst" | "viewer" | null) {
  if (!role) return null;
  return {
    user: {
      id: `test-${role}`,
      email: `${role}@test.local`,
      role,
    },
    session: { id: `sess-${role}` },
  };
}

describe("TC-014 Finding status transition", () => {
  const createdAssetIds: string[] = [];
  const createdFindingIds: string[] = [];

  async function seedFinding(title: string) {
    const [asset] = await db
      .insert(assets)
      .values({
        hostname: `tc014-${Date.now()}-${Math.random().toString(16).slice(2)}.lab.local`,
        ip: "10.14.0.1",
        description: "tc014",
      })
      .returning();
    createdAssetIds.push(asset.id);

    const [finding] = await db
      .insert(findings)
      .values({
        assetId: asset.id,
        title,
        severity: "high",
        status: "open",
        cveId: "CVE-2021-44228",
      })
      .returning();
    createdFindingIds.push(finding.id);
    return finding;
  }

  afterAll(async () => {
    for (const id of createdFindingIds) {
      await db.delete(findings).where(eq(findings.id, id));
    }
    for (const id of createdAssetIds) {
      await db.delete(assets).where(eq(assets.id, id));
    }
  });

  it("validates status enum on schema", () => {
    expect(updateFindingStatusSchema.safeParse({ status: "open" }).success).toBe(
      true,
    );
    expect(
      updateFindingStatusSchema.safeParse({ status: "bogus" }).success,
    ).toBe(false);
    expect(updateFindingStatusSchema.safeParse({}).success).toBe(false);
  });

  it("analyst: open → fixed → open → accepted; open → false_positive", async () => {
    const a = await seedFinding("tc014 analyst path A");
    const fixed = await updateFindingStatus(a.id, "fixed", "analyst");
    expect(fixed?.status).toBe("fixed");
    expect(new Date(fixed!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      a.updatedAt.getTime(),
    );

    const reopened = await updateFindingStatus(a.id, "open", "analyst");
    expect(reopened?.status).toBe("open");

    const accepted = await updateFindingStatus(a.id, "accepted", "analyst");
    expect(accepted?.status).toBe("accepted");

    // accepted → open is admin-only for analyst
    await expect(
      updateFindingStatus(a.id, "open", "analyst"),
    ).rejects.toBeInstanceOf(AuthError);

    const b = await seedFinding("tc014 analyst path B");
    const fp = await updateFindingStatus(b.id, "false_positive", "analyst");
    expect(fp?.status).toBe("false_positive");
  });

  it("admin can reopen accepted / false_positive", async () => {
    const f = await seedFinding("tc014 admin reopen");
    await updateFindingStatus(f.id, "accepted", "admin");
    const reopened = await updateFindingStatus(f.id, "open", "admin");
    expect(reopened?.status).toBe("open");

    await updateFindingStatus(f.id, "false_positive", "admin");
    const again = await updateFindingStatus(f.id, "open", "admin");
    expect(again?.status).toBe("open");
  });

  it("rejects disallowed transitions with 400", async () => {
    const f = await seedFinding("tc014 bad transition");
    await updateFindingStatus(f.id, "fixed", "analyst");
    await expect(
      updateFindingStatus(f.id, "accepted", "analyst"),
    ).rejects.toBeInstanceOf(FindingTransitionError);
  });

  it("API: unauthenticated → 401; viewer PATCH → 403", async () => {
    const f = await seedFinding("tc014 api rbac");

    getSessionMock.mockResolvedValue(null);
    const unauth = await listGet(new Request("http://localhost/api/findings"));
    expect(unauth.status).toBe(401);

    getSessionMock.mockResolvedValue(sessionFor("viewer"));
    const forbidden = await PATCH(
      new Request(`http://localhost/api/findings/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "fixed" }),
      }),
      { params: Promise.resolve({ id: f.id }) },
    );
    expect(forbidden.status).toBe(403);

    // viewer can still list
    const listRes = await listGet(
      new Request("http://localhost/api/findings?status=open"),
    );
    expect(listRes.status).toBe(200);
  });

  it("API: analyst PATCH updates status; invalid enum → 400", async () => {
    const f = await seedFinding("tc014 api patch");

    getSessionMock.mockResolvedValue(sessionFor("analyst"));
    const ok = await PATCH(
      new Request(`http://localhost/api/findings/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "fixed" }),
      }),
      { params: Promise.resolve({ id: f.id }) },
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { status: string; id: string };
    expect(body.status).toBe("fixed");
    expect(body.id).toBe(f.id);

    const bad = await PATCH(
      new Request(`http://localhost/api/findings/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "nope" }),
      }),
      { params: Promise.resolve({ id: f.id }) },
    );
    expect(bad.status).toBe(400);

    const listed = await listFindings({
      page: 1,
      pageSize: 50,
      status: "fixed",
      q: "tc014 api patch",
    });
    expect(listed.items.some((i) => i.id === f.id)).toBe(true);
  });
});
