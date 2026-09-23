import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asRole, jsonOf } from "./helpers/auth-mock";

/**
 * TC-011 Scan rejects outside allowlist
 */
describe("TC-011 Scan allowlist reject", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");
  let scansRoute: typeof import("@/app/api/scans/route");
  let startCallCount: { n: number };

  beforeAll(async () => {
    process.env.SCAN_ADAPTER_MODE = "fixture";
    process.env.SCAN_REJECT_NON_ALLOWLIST = "true";

    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    scansRoute = await import("@/app/api/scans/route");

    // Avoid Redis dependency: stub queue add
    const enqueueMod = await import("@/lib/scans/enqueue");
    vi.spyOn(enqueueMod, "getScanQueue").mockReturnValue({
      add: vi.fn().mockResolvedValue({ id: "bull-mock-1" }),
    } as unknown as ReturnType<typeof enqueueMod.getScanQueue>);

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
    await db.delete(schema.services);
    await db.delete(schema.scanJobs);
    await db.delete(schema.assets);
    await db.delete(schema.allowlistTargets);

    await db.insert(schema.allowlistTargets).values({
      pattern: "10.0.0.0/8",
      patternType: "cidr",
      enabled: true,
      description: "lab",
    });

    startCallCount = { n: 0 };
    const { nmapAdapter } = await import("@/lib/scans/adapters/nmap");
    vi.spyOn(nmapAdapter, "start").mockImplementation(async () => {
      startCallCount.n += 1;
      throw new Error("nmap start must not be called from HTTP enqueue path");
    });
  });

  it("rejects outside allowlist; accepts inside; disable re-rejects", async () => {
    // 1) Outside allowlist → ALLOWLIST_REJECTED; nmap never started
    const rejectRes = await scansRoute.POST(
      new Request("http://localhost/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "nmap", target: "8.8.8.8" }),
      }),
    );
    expect(rejectRes.status).toBe(400);
    expect(
      ((await jsonOf(rejectRes)).error as { code?: string }).code,
    ).toBe("ALLOWLIST_REJECTED");
    expect(startCallCount.n).toBe(0);

    const failedJobs = await db.select().from(schema.scanJobs);
    expect(failedJobs).toHaveLength(1);
    expect(failedJobs[0].status).toBe("failed");
    expect(failedJobs[0].errorMessage).toBe("ALLOWLIST_REJECTED");

    // 2) Inside allowlist → accepted (queued); HTTP path still does not start nmap
    const okRes = await scansRoute.POST(
      new Request("http://localhost/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "nmap",
          target: "10.1.2.3",
          options: {
            fixturePath: path.join(
              process.cwd(),
              "tests/fixtures/nmap-sample.xml",
            ),
          },
        }),
      }),
    );
    expect(okRes.status).toBe(202);
    const okBody = await jsonOf(okRes);
    expect(okBody.accepted).toBe(true);
    expect((okBody.job as { status: string }).status).toBe("queued");
    expect(startCallCount.n).toBe(0);

    // 3) Add 8.8.8.8/32 → accept
    await db.insert(schema.allowlistTargets).values({
      pattern: "8.8.8.8/32",
      patternType: "cidr",
      enabled: true,
    });
    const ok88 = await scansRoute.POST(
      new Request("http://localhost/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "nmap", target: "8.8.8.8" }),
      }),
    );
    expect(ok88.status).toBe(202);

    // 4) Disable 10.0.0.0/8 → reject 10.1.2.3
    const rows = await db.select().from(schema.allowlistTargets);
    const cidr = rows.find((r) => r.pattern === "10.0.0.0/8");
    expect(cidr).toBeTruthy();
    await db
      .update(schema.allowlistTargets)
      .set({ enabled: false })
      .where(eq(schema.allowlistTargets.id, cidr!.id));

    const rejectAgain = await scansRoute.POST(
      new Request("http://localhost/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "nmap", target: "10.1.2.3" }),
      }),
    );
    expect(rejectAgain.status).toBe(400);
    expect(
      ((await jsonOf(rejectAgain)).error as { code?: string }).code,
    ).toBe("ALLOWLIST_REJECTED");
    expect(startCallCount.n).toBe(0);
  });
});
