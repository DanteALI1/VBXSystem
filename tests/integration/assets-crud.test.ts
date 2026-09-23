import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  asRole,
  authState,
  jsonOf,
} from "./helpers/auth-mock";

/**
 * TC-009 Assets CRUD (integration)
 */
describe("TC-009 Assets CRUD", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");
  let assetsRoute: typeof import("@/app/api/assets/route");
  let assetIdRoute: typeof import("@/app/api/assets/[id]/route");
  let servicesRoute: typeof import("@/app/api/assets/[id]/services/route");

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    assetsRoute = await import("@/app/api/assets/route");
    assetIdRoute = await import("@/app/api/assets/[id]/route");
    servicesRoute = await import("@/app/api/assets/[id]/services/route");

    // Ensure FK user exists for createdById
    for (const u of [
      { id: "tc-test-user-admin", email: "admin@test.local", role: "admin" as const },
      { id: "tc-test-user-analyst", email: "analyst@test.local", role: "analyst" as const },
      { id: "tc-test-user-viewer", email: "viewer@test.local", role: "viewer" as const },
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
    await db.delete(schema.services);
    await db.delete(schema.assets);
  });

  it("creates, lists, patches asset; upserts service; admin deletes; viewer denied create; bad IP 400", async () => {
    // Create
    const createRes = await assetsRoute.POST(
      new Request("http://localhost/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "lab-web-1",
          ip: "10.10.0.5",
          environment: "lab",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = await jsonOf(createRes);
    expect(created.name).toBe("lab-web-1");
    expect(created.ip).toBe("10.10.0.5");
    const assetId = created.id as string;

    // List
    const listRes = await assetsRoute.GET(
      new Request("http://localhost/api/assets"),
    );
    expect(listRes.status).toBe(200);
    const list = await jsonOf(listRes);
    const items = list.items as { id: string; name: string }[];
    expect(items.some((i) => i.id === assetId)).toBe(true);

    // PATCH hostname + notes
    const patchRes = await assetIdRoute.PATCH(
      new Request(`http://localhost/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: "lab-web-1.internal",
          notes: "primary lab host",
        }),
      }),
      { params: Promise.resolve({ id: assetId }) },
    );
    expect(patchRes.status).toBe(200);
    const patched = await jsonOf(patchRes);
    expect(patched.hostname).toBe("lab-web-1.internal");
    expect(patched.notes).toBe("primary lab host");

    // Add service 443/tcp
    const svcRes = await servicesRoute.POST(
      new Request(`http://localhost/api/assets/${assetId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: 443, protocol: "tcp" }),
      }),
      { params: Promise.resolve({ id: assetId }) },
    );
    expect(svcRes.status).toBe(201);

    // Duplicate service → upsert (200)
    const dupRes = await servicesRoute.POST(
      new Request(`http://localhost/api/assets/${assetId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: 443,
          protocol: "tcp",
          product: "nginx",
        }),
      }),
      { params: Promise.resolve({ id: assetId }) },
    );
    expect(dupRes.status).toBe(200);
    const upserted = await jsonOf(dupRes);
    expect(upserted.product).toBe("nginx");

    const detailRes = await assetIdRoute.GET(
      new Request(`http://localhost/api/assets/${assetId}`),
      { params: Promise.resolve({ id: assetId }) },
    );
    const detail = await jsonOf(detailRes);
    expect((detail.services as unknown[]).length).toBe(1);

    // Viewer cannot create
    asRole("viewer", "tc-test-user-viewer");
    const viewerCreate = await assetsRoute.POST(
      new Request("http://localhost/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "nope", ip: "10.0.0.1" }),
      }),
    );
    expect(viewerCreate.status).toBe(403);

    // Analyst can still mutate; invalid IP → 400
    asRole("analyst", "tc-test-user-analyst");
    const badIp = await assetsRoute.POST(
      new Request("http://localhost/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "bad", ip: "999.1.2.3" }),
      }),
    );
    expect(badIp.status).toBe(400);

    // Analyst cannot delete (admin only)
    const analystDelete = await assetIdRoute.DELETE(
      new Request(`http://localhost/api/assets/${assetId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: assetId }) },
    );
    expect(analystDelete.status).toBe(403);

    // Admin deletes
    asRole("admin", "tc-test-user-admin");
    const del = await assetIdRoute.DELETE(
      new Request(`http://localhost/api/assets/${assetId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: assetId }) },
    );
    expect(del.status).toBe(200);

    const [gone] = await db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, assetId))
      .limit(1);
    expect(gone).toBeUndefined();
    expect(authState.role).toBe("admin");
  });
});
