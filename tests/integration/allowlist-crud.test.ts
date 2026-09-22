import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { allowlistTargets } from "@/db/schema";
import { isTargetAllowed } from "@/lib/domain/allowlist";
import {
  createAllowlistSchema,
  createAllowlistTarget,
  deleteAllowlistTarget,
  listAllowlist,
  updateAllowlistTarget,
} from "@/lib/allowlist";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/auth/session";
import { GET, POST } from "@/app/api/allowlist/route";
import { DELETE, PATCH } from "@/app/api/allowlist/[id]/route";

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

describe("TC-010 allowlist CRUD", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(allowlistTargets).where(eq(allowlistTargets.id, id));
    }
  });

  it("rejects invalid CIDR / empty pattern", () => {
    expect(
      createAllowlistSchema.safeParse({
        pattern: "",
        type: "cidr",
      }).success,
    ).toBe(false);
    expect(
      createAllowlistSchema.safeParse({
        pattern: "not-a-cidr",
        type: "cidr",
      }).success,
    ).toBe(false);
    expect(
      createAllowlistSchema.safeParse({
        pattern: "10.0.0.0/8",
        type: "cidr",
        enabled: true,
      }).success,
    ).toBe(true);
    expect(
      createAllowlistSchema.safeParse({
        pattern: "https://app.example.com/api",
        type: "url",
      }).success,
    ).toBe(true);
  });

  it("creates list updates and deletes rules (lib)", async () => {
    const cidr = await createAllowlistTarget({
      pattern: "10.10.0.0/16",
      type: "cidr",
      enabled: true,
      description: "tc010 cidr",
    });
    createdIds.push(cidr.id);

    const url = await createAllowlistTarget({
      pattern: "https://app.example.com/api",
      type: "url",
      enabled: true,
      description: "tc010 url",
    });
    createdIds.push(url.id);

    const listed = await listAllowlist({ page: 1, pageSize: 100 });
    expect(listed.items.some((i) => i.id === cidr.id)).toBe(true);
    expect(listed.items.some((i) => i.id === url.id)).toBe(true);

    const disabled = await updateAllowlistTarget(cidr.id, { enabled: false });
    expect(disabled?.enabled).toBe(false);

    expect(
      isTargetAllowed("10.10.1.5", [
        { pattern: disabled!.pattern, type: "cidr", enabled: disabled!.enabled },
        { pattern: url.pattern, type: "url", enabled: true },
      ]),
    ).toBe(false);

    expect(
      isTargetAllowed("https://app.example.com/api/v1", [
        { pattern: url.pattern, type: "url", enabled: true },
      ]),
    ).toBe(true);

    expect(await deleteAllowlistTarget(url.id)).toBe(true);
    createdIds.splice(createdIds.indexOf(url.id), 1);

    expect(await deleteAllowlistTarget(cidr.id)).toBe(true);
    createdIds.splice(createdIds.indexOf(cidr.id), 1);
  });

  it("API: unauthenticated → 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/allowlist"));
    expect(res.status).toBe(401);
  });

  it("API: viewer and analyst cannot mutate; admin can CRUD", async () => {
    getSessionMock.mockResolvedValue(sessionFor("viewer"));
    const viewerDenied = await POST(
      new Request("http://localhost/api/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: "10.0.0.0/8", type: "cidr" }),
      }),
    );
    expect(viewerDenied.status).toBe(403);

    getSessionMock.mockResolvedValue(sessionFor("analyst"));
    const analystDenied = await POST(
      new Request("http://localhost/api/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: "10.0.0.0/8", type: "cidr" }),
      }),
    );
    expect(analystDenied.status).toBe(403);

    getSessionMock.mockResolvedValue(sessionFor("admin"));
    const cidrRes = await POST(
      new Request("http://localhost/api/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: "10.20.0.0/16",
          type: "cidr",
          enabled: true,
          description: "api cidr",
        }),
      }),
    );
    expect(cidrRes.status).toBe(201);
    const cidr = (await cidrRes.json()) as { id: string };
    createdIds.push(cidr.id);

    const urlRes = await POST(
      new Request("http://localhost/api/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: "https://app.example.com/api",
          type: "url",
          enabled: true,
        }),
      }),
    );
    expect(urlRes.status).toBe(201);
    const urlRule = (await urlRes.json()) as { id: string };
    createdIds.push(urlRule.id);

    const listRes = await GET(new Request("http://localhost/api/allowlist"));
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { items: { id: string }[] };
    expect(list.items.some((i) => i.id === cidr.id)).toBe(true);
    expect(list.items.some((i) => i.id === urlRule.id)).toBe(true);

    const disableRes = await PATCH(
      new Request(`http://localhost/api/allowlist/${cidr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id: cidr.id }) },
    );
    expect(disableRes.status).toBe(200);
    const disabled = (await disableRes.json()) as { enabled: boolean };
    expect(disabled.enabled).toBe(false);

    const delRes = await DELETE(
      new Request(`http://localhost/api/allowlist/${urlRule.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: urlRule.id }) },
    );
    expect(delRes.status).toBe(204);
    createdIds.splice(createdIds.indexOf(urlRule.id), 1);

    await deleteAllowlistTarget(cidr.id);
    createdIds.splice(createdIds.indexOf(cidr.id), 1);
  });

  it("API: invalid CIDR → 400", async () => {
    getSessionMock.mockResolvedValue(sessionFor("admin"));
    const res = await POST(
      new Request("http://localhost/api/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: "bad", type: "cidr" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
