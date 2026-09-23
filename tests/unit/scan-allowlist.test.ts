import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { scanJobs, users } from "@/db/schema";
import { isTargetAllowed } from "@/lib/domain/allowlist";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/sync/queues", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync/queues")>();
  return {
    ...actual,
    enqueueScanJob: vi.fn(async ({ scanJobId }: { scanJobId: string }) => ({
      jobId: scanJobId,
    })),
  };
});

import { getSession } from "@/lib/auth/session";
import { POST } from "@/app/api/scans/route";
import { createAndEnqueueScan, ScanAllowlistError } from "@/lib/scans";

const getSessionMock = getSession as unknown as ReturnType<typeof vi.fn>;

describe("scan allowlist gate (TC-011)", () => {
  const createdIds: string[] = [];
  let adminUserId = "";

  beforeAll(async () => {
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    adminUserId = admin?.id ?? "";
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(scanJobs).where(eq(scanJobs.id, id));
    }
  });

  function sessionFor(role: "admin" | "analyst" | "viewer" | null) {
    if (!role) return null;
    return {
      user: {
        id: adminUserId || `test-${role}`,
        email: `${role}@test.local`,
        role,
      },
      session: { id: `sess-${role}` },
    };
  }

  it("domain helper rejects outside CIDR", () => {
    const rules = [
      { pattern: "10.0.0.0/8", type: "cidr" as const, enabled: true },
    ];
    expect(isTargetAllowed("10.1.2.3", rules)).toBe(true);
    expect(isTargetAllowed("11.0.0.1", rules)).toBe(false);
  });

  it("createAndEnqueueScan throws for target outside allowlist", async () => {
    await expect(
      createAndEnqueueScan(
        { type: "nmap", target: "8.8.8.8", options: { fixture: true } },
        null,
      ),
    ).rejects.toBeInstanceOf(ScanAllowlistError);
  });

  it("POST /api/scans returns 400 and does not create job outside allowlist", async () => {
    getSessionMock.mockResolvedValue(sessionFor("analyst"));

    const before = await db.select({ id: scanJobs.id }).from(scanJobs);

    const res = await POST(
      new Request("http://localhost/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "nmap",
          target: "203.0.113.10",
          options: { fixture: true },
        }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/allowlist/i);

    const after = await db.select({ id: scanJobs.id }).from(scanJobs);
    expect(after.length).toBe(before.length);
  });

  it("POST /api/scans accepts target inside allowlist", async () => {
    expect(adminUserId).toBeTruthy();
    getSessionMock.mockResolvedValue(sessionFor("analyst"));

    const res = await POST(
      new Request("http://localhost/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "nmap",
          target: "10.0.1.10",
          options: { fixture: true },
        }),
      }),
    );

    expect(res.status).toBe(202);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.status).toBe("queued");
    expect(body.id).toBeTruthy();
    createdIds.push(body.id);
  });
});
