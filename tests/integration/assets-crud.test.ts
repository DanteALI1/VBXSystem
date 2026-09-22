import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets, findings, services } from "@/db/schema";
import {
  createAsset,
  createAssetSchema,
  deleteAsset,
  getAssetById,
  listAssets,
  updateAsset,
} from "@/lib/assets";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/auth/session";
import { GET as listOrCreateGet, POST } from "@/app/api/assets/route";
import {
  DELETE,
  GET as getOne,
  PATCH,
} from "@/app/api/assets/[id]/route";

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

describe("TC-009 assets CRUD", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(assets).where(eq(assets.id, id));
    }
  });

  it("validates hostname and ip on create schema", () => {
    expect(createAssetSchema.safeParse({ hostname: "", ip: "10.0.0.1" }).success).toBe(
      false,
    );
    expect(
      createAssetSchema.safeParse({ hostname: "web.lab", ip: "not-an-ip" }).success,
    ).toBe(false);
    expect(
      createAssetSchema.safeParse({
        hostname: "web.lab",
        ip: "10.0.0.1",
        description: "x",
      }).success,
    ).toBe(true);
  });

  it("creates, lists, updates, and deletes an asset (lib)", async () => {
    const created = await createAsset({
      hostname: `tc009-${Date.now()}.lab.local`,
      ip: "10.9.9.1",
      description: "tc009 create",
    });
    createdIds.push(created.id);

    const listed = await listAssets({ page: 1, pageSize: 100, q: created.hostname });
    expect(listed.items.some((a) => a.id === created.id)).toBe(true);

    const updated = await updateAsset(created.id, {
      description: "tc009 updated",
      hostname: created.hostname,
    });
    expect(updated?.description).toBe("tc009 updated");

    const detail = await getAssetById(created.id);
    expect(detail?.services).toEqual([]);

    // attach service + finding to verify cascade
    const [svc] = await db
      .insert(services)
      .values({
        assetId: created.id,
        port: 443,
        protocol: "tcp",
        name: "https",
      })
      .returning();
    await db.insert(findings).values({
      assetId: created.id,
      serviceId: svc.id,
      title: "cascade probe",
      severity: "low",
      status: "open",
    });

    const ok = await deleteAsset(created.id);
    expect(ok).toBe(true);
    expect(await getAssetById(created.id)).toBeNull();

    const leftoverServices = await db
      .select()
      .from(services)
      .where(eq(services.assetId, created.id));
    expect(leftoverServices).toHaveLength(0);
    createdIds.splice(createdIds.indexOf(created.id), 1);
  });

  it("API: unauthenticated → 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await listOrCreateGet(new Request("http://localhost/api/assets"));
    expect(res.status).toBe(401);
  });

  it("API: viewer cannot create; analyst can create/list", async () => {
    getSessionMock.mockResolvedValue(sessionFor("viewer"));
    const forbidden = await POST(
      new Request("http://localhost/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: "viewer-blocked.lab.local",
          ip: "10.9.9.2",
        }),
      }),
    );
    expect(forbidden.status).toBe(403);

    getSessionMock.mockResolvedValue(sessionFor("analyst"));
    const hostname = `api-tc009-${Date.now()}.lab.local`;
    const createdRes = await POST(
      new Request("http://localhost/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname,
          ip: "10.9.9.3",
          description: "via api",
        }),
      }),
    );
    expect(createdRes.status).toBe(201);
    const created = (await createdRes.json()) as { id: string; hostname: string };
    createdIds.push(created.id);
    expect(created.hostname).toBe(hostname);

    const listRes = await listOrCreateGet(
      new Request(`http://localhost/api/assets?q=${encodeURIComponent(hostname)}`),
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { items: { id: string }[]; total: number };
    expect(list.items.some((i) => i.id === created.id)).toBe(true);

    const getRes = await getOne(new Request(`http://localhost/api/assets/${created.id}`), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(getRes.status).toBe(200);
    const detail = (await getRes.json()) as { services: unknown[] };
    expect(Array.isArray(detail.services)).toBe(true);

    const patchRes = await PATCH(
      new Request(`http://localhost/api/assets/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "patched" }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(patchRes.status).toBe(200);

    const delRes = await DELETE(
      new Request(`http://localhost/api/assets/${created.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(delRes.status).toBe(204);
    createdIds.splice(createdIds.indexOf(created.id), 1);
  });

  it("API: empty hostname/ip → 400", async () => {
    getSessionMock.mockResolvedValue(sessionFor("admin"));
    const res = await POST(
      new Request("http://localhost/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: "", ip: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
