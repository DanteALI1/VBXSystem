import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asRole, jsonOf } from "./helpers/auth-mock";

/**
 * TC-010 Allowlist CRUD (integration)
 */
describe("TC-010 Allowlist CRUD", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");
  let allowlistRoute: typeof import("@/app/api/allowlist/route");
  let allowlistIdRoute: typeof import("@/app/api/allowlist/[id]/route");

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    allowlistRoute = await import("@/app/api/allowlist/route");
    allowlistIdRoute = await import("@/app/api/allowlist/[id]/route");

    for (const u of [
      { id: "tc-test-user-admin", email: "admin@test.local", role: "admin" as const },
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
    asRole("admin", "tc-test-user-admin");
    await db.delete(schema.allowlistTargets);
  });

  it("admin CRUD + enable toggle; viewer read-only; invalid cidr 400; duplicate 409", async () => {
    const createRes = await allowlistRoute.POST(
      new Request("http://localhost/api/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: "10.10.0.0/24",
          patternType: "cidr",
          description: "lab",
          enabled: true,
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const created = await jsonOf(createRes);
    expect(created.pattern).toBe("10.10.0.0/24");
    expect(created.enabled).toBe(true);
    const id = created.id as string;

    const listRes = await allowlistRoute.GET(
      new Request("http://localhost/api/allowlist"),
    );
    expect(listRes.status).toBe(200);
    const list = await jsonOf(listRes);
    expect(
      (list.items as { id: string }[]).some((i) => i.id === id),
    ).toBe(true);

    // Disable
    const disableRes = await allowlistIdRoute.PATCH(
      new Request(`http://localhost/api/allowlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(disableRes.status).toBe(200);
    expect((await jsonOf(disableRes)).enabled).toBe(false);

    // Re-enable + notes
    const enableRes = await allowlistIdRoute.PATCH(
      new Request(`http://localhost/api/allowlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          description: "lab updated",
        }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(enableRes.status).toBe(200);
    const enabled = await jsonOf(enableRes);
    expect(enabled.enabled).toBe(true);
    expect(enabled.description).toBe("lab updated");

    // Duplicate → 409
    const dup = await allowlistRoute.POST(
      new Request("http://localhost/api/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: "10.10.0.0/24",
          patternType: "cidr",
        }),
      }),
    );
    expect(dup.status).toBe(409);

    // Invalid CIDR → 400
    const bad = await allowlistRoute.POST(
      new Request("http://localhost/api/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: "10.10.0.0/99",
          patternType: "cidr",
        }),
      }),
    );
    expect(bad.status).toBe(400);

    // Viewer: GET ok, mutate 403
    asRole("viewer", "tc-test-user-viewer");
    const viewerGet = await allowlistRoute.GET(
      new Request("http://localhost/api/allowlist"),
    );
    expect(viewerGet.status).toBe(200);

    const viewerPost = await allowlistRoute.POST(
      new Request("http://localhost/api/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: "192.168.0.0/16",
          patternType: "cidr",
        }),
      }),
    );
    expect(viewerPost.status).toBe(403);

    const viewerPatch = await allowlistIdRoute.PATCH(
      new Request(`http://localhost/api/allowlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(viewerPatch.status).toBe(403);

    const viewerDel = await allowlistIdRoute.DELETE(
      new Request(`http://localhost/api/allowlist/${id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(viewerDel.status).toBe(403);

    // Admin DELETE
    asRole("admin", "tc-test-user-admin");
    const del = await allowlistIdRoute.DELETE(
      new Request(`http://localhost/api/allowlist/${id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(del.status).toBe(200);
  });
});
