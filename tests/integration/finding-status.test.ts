import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asRole, jsonOf } from "./helpers/auth-mock";

/**
 * TC-014 Finding status transition (integration)
 */
describe("TC-014 Finding status transition", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");
  let findingsRoute: typeof import("@/app/api/findings/route");
  let findingIdRoute: typeof import("@/app/api/findings/[id]/route");
  let findingId: string;

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    findingsRoute = await import("@/app/api/findings/route");
    findingIdRoute = await import("@/app/api/findings/[id]/route");

    for (const u of [
      {
        id: "tc-test-user-admin",
        email: "admin@test.local",
        role: "admin" as const,
      },
      {
        id: "tc-test-user-analyst",
        email: "analyst@test.local",
        role: "analyst" as const,
      },
      {
        id: "tc-test-user-viewer",
        email: "viewer@test.local",
        role: "viewer" as const,
      },
    ]) {
      await db
        .insert(schema.user)
        .values({
          id: u.id,
          name: u.role,
          email: u.email,
          emailVerified: true,
          role: u.role,
        })
        .onConflictDoNothing();
    }
  });

  beforeEach(async () => {
    asRole("analyst", "tc-test-user-analyst");
    await db.delete(schema.findings);

    const [created] = await db
      .insert(schema.findings)
      .values({
        title: "Sample open finding",
        status: "open",
        severity: "high",
        cveId: "CVE-2024-TEST",
        bduId: "BDU:2024-TEST",
      })
      .returning();
    findingId = created.id;
  });

  it("analyst transitions status; invalid status 400; viewer 403", async () => {
    // open → accepted
    const toAccepted = await findingIdRoute.PATCH(
      new Request(`http://localhost/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      }),
      { params: Promise.resolve({ id: findingId }) },
    );
    expect(toAccepted.status).toBe(200);
    const accepted = await jsonOf(toAccepted);
    expect(accepted.status).toBe("accepted");
    expect(accepted.updatedAt).toBeTruthy();

    // accepted → fixed
    const toFixed = await findingIdRoute.PATCH(
      new Request(`http://localhost/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "fixed" }),
      }),
      { params: Promise.resolve({ id: findingId }) },
    );
    expect(toFixed.status).toBe(200);
    expect((await jsonOf(toFixed)).status).toBe("fixed");

    // fixed → open (regression)
    const toOpen = await findingIdRoute.PATCH(
      new Request(`http://localhost/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      }),
      { params: Promise.resolve({ id: findingId }) },
    );
    expect(toOpen.status).toBe(200);
    expect((await jsonOf(toOpen)).status).toBe("open");

    // open → false_positive
    const toFp = await findingIdRoute.PATCH(
      new Request(`http://localhost/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "false_positive" }),
      }),
      { params: Promise.resolve({ id: findingId }) },
    );
    expect(toFp.status).toBe(200);
    expect((await jsonOf(toFp)).status).toBe("false_positive");

    // unknown status → 400 VALIDATION_ERROR
    const bad = await findingIdRoute.PATCH(
      new Request(`http://localhost/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" }),
      }),
      { params: Promise.resolve({ id: findingId }) },
    );
    expect(bad.status).toBe(400);
    const badBody = await jsonOf(bad);
    const err = badBody.error as { code?: string };
    expect(err.code === "VALIDATION_ERROR" || err.code === "INVALID_STATUS_TRANSITION").toBe(
      true,
    );

    // List returns the finding
    const listRes = await findingsRoute.GET(
      new Request("http://localhost/api/findings?status=false_positive"),
    );
    expect(listRes.status).toBe(200);
    const list = await jsonOf(listRes);
    const items = list.items as { id: string; status: string }[];
    expect(items.some((i) => i.id === findingId)).toBe(true);

    // Viewer cannot PATCH
    asRole("viewer", "tc-test-user-viewer");
    const viewerPatch = await findingIdRoute.PATCH(
      new Request(`http://localhost/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      }),
      { params: Promise.resolve({ id: findingId }) },
    );
    expect(viewerPatch.status).toBe(403);

    // DB still false_positive
    const [row] = await db
      .select()
      .from(schema.findings)
      .where(eq(schema.findings.id, findingId))
      .limit(1);
    expect(row?.status).toBe("false_positive");
  });

  it("lists findings filtered by cveId / bduId correlation params", async () => {
    await db.insert(schema.findings).values({
      title: "Other CVE finding",
      status: "open",
      severity: "medium",
      cveId: "CVE-OTHER",
    });

    const byCve = await findingsRoute.GET(
      new Request("http://localhost/api/findings?cveId=CVE-2024-TEST"),
    );
    expect(byCve.status).toBe(200);
    const cveList = await jsonOf(byCve);
    const cveItems = cveList.items as { cveId: string | null }[];
    expect(cveItems.length).toBeGreaterThanOrEqual(1);
    expect(cveItems.every((i) => i.cveId === "CVE-2024-TEST")).toBe(true);

    const byBdu = await findingsRoute.GET(
      new Request("http://localhost/api/findings?bduId=BDU:2024-TEST"),
    );
    expect(byBdu.status).toBe(200);
    const bduList = await jsonOf(byBdu);
    expect((bduList.total as number) >= 1).toBe(true);
  });
});
