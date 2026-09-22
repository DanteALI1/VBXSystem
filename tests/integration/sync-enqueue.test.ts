import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { syncStates, type SyncState } from "@/db/schema";
import { db } from "@/lib/db/client";
import {
  BDU_QUEUE_NAME,
  NVD_QUEUE_NAME,
  ensureSyncState,
  getBduQueue,
  getNvdQueue,
} from "@/lib/sync";
import * as syncState from "@/lib/sync/state";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/auth/session";
import { sessionFor } from "../helpers/session";
import { GET as getStatus } from "@/app/api/sync/status/route";
import { POST as postNvd } from "@/app/api/sync/nvd/route";
import { POST as postBdu } from "@/app/api/sync/bdu/route";

const getSessionMock = getSession as unknown as ReturnType<typeof vi.fn>;

async function resetSyncIdle(source: "nvd" | "bdu") {
  await ensureSyncState(source);
  await db
    .update(syncStates)
    .set({ status: "idle" })
    .where(eq(syncStates.source, source));
}

describe("TC-015 sync settings enqueue jobs", () => {
  beforeEach(async () => {
    await resetSyncIdle("nvd");
    await resetSyncIdle("bdu");
  });

  afterAll(async () => {
    await resetSyncIdle("nvd");
    await resetSyncIdle("bdu");
  });

  it("GET /api/sync/status returns nvd + bdu states for authenticated user", async () => {
    getSessionMock.mockResolvedValue(sessionFor("viewer"));
    const res = await getStatus();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      nvd: { source: string; status: string };
      bdu: { source: string; status: string };
    };
    expect(body.nvd.source).toBe("nvd");
    expect(body.bdu.source).toBe("bdu");
    expect(body.nvd.status).toBeTruthy();
    expect(body.bdu.status).toBeTruthy();
  });

  it("GET /api/sync/status unauthenticated → 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await getStatus();
    expect(res.status).toBe(401);
  });

  it("admin POST /api/sync/nvd → 202 + job in nvd-sync queue (enqueue only)", async () => {
    getSessionMock.mockResolvedValue(sessionFor("admin"));
    const res = await postNvd(
      new Request("http://localhost/api/sync/nvd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "fixture", force: true }),
      }),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string };
    expect(body.jobId).toBeTruthy();

    const job = await getNvdQueue().getJob(body.jobId);
    expect(job).toBeTruthy();
    expect(job!.name).toBe("nvd-sync");
    expect(job!.data.mode).toBe("fixture");
    expect(job!.data.triggeredBy).toBe("test-admin");
  });

  it("admin POST /api/sync/bdu → 202 + job in bdu-sync queue", async () => {
    getSessionMock.mockResolvedValue(sessionFor("admin"));
    const res = await postBdu(
      new Request("http://localhost/api/sync/bdu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "fixture", force: true }),
      }),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string };
    expect(body.jobId).toBeTruthy();

    const job = await getBduQueue().getJob(body.jobId);
    expect(job).toBeTruthy();
    expect(job!.name).toBe("bdu-sync");
    expect(job!.data.mode).toBe("fixture");
  });

  it("rejects duplicate enqueue while status=running → 409", async () => {
    // Stub state so a live worker cannot flip status between write and POST.
    const running = {
      ...(await ensureSyncState("nvd")),
      status: "running" as const,
    } satisfies SyncState;
    const spy = vi
      .spyOn(syncState, "ensureSyncState")
      .mockResolvedValue(running);

    getSessionMock.mockResolvedValue(sessionFor("admin"));
    try {
      const res = await postNvd(
        new Request("http://localhost/api/sync/nvd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "fixture" }),
        }),
      );
      expect(res.status).toBe(409);
    } finally {
      spy.mockRestore();
    }
  });

  it("queue names match workers contract", () => {
    expect(NVD_QUEUE_NAME).toBe("nvd-sync");
    expect(BDU_QUEUE_NAME).toBe("bdu-sync");
  });
});

describe("TC-002 viewer cannot trigger sync (P0)", () => {
  beforeEach(async () => {
    await resetSyncIdle("nvd");
    await resetSyncIdle("bdu");
  });

  it("viewer POST nvd/bdu → 403 and no new waiting job required", async () => {
    getSessionMock.mockResolvedValue(sessionFor("viewer"));

    const nvdRes = await postNvd(
      new Request("http://localhost/api/sync/nvd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "fixture" }),
      }),
    );
    expect(nvdRes.status).toBe(403);

    const bduRes = await postBdu(
      new Request("http://localhost/api/sync/bdu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "fixture" }),
      }),
    );
    expect(bduRes.status).toBe(403);
  });

  it("analyst also forbidden (canTriggerSync = admin only per auth-roles)", async () => {
    getSessionMock.mockResolvedValue(sessionFor("analyst"));
    const res = await postNvd(
      new Request("http://localhost/api/sync/nvd", {
        method: "POST",
        body: JSON.stringify({ mode: "fixture" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("admin can enqueue (positive control)", async () => {
    getSessionMock.mockResolvedValue(sessionFor("admin"));
    const res = await postNvd(
      new Request("http://localhost/api/sync/nvd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "fixture", force: true }),
      }),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string };
    expect(body.jobId).toBeTruthy();
  });
});
