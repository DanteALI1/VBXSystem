import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { syncStates } from "@/db/schema";
import { db } from "@/lib/db/client";
import { runBduSync } from "@/lib/bdu/sync";
import { ensureSyncState, getBduQueue } from "@/lib/sync";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/auth/session";
import { sessionFor } from "../helpers/session";
import { POST as postUpload } from "@/app/api/sync/bdu/upload/route";

const getSessionMock = getSession as unknown as ReturnType<typeof vi.fn>;

const FIXTURE_PATH = path.join(process.cwd(), "tests/fixtures/bdu-mini.xml");
const FIXTURE_XML = readFileSync(FIXTURE_PATH);

async function resetBduIdle(extra?: { fileHash?: string | null }) {
  await ensureSyncState("bdu");
  await db
    .update(syncStates)
    .set({
      status: "idle",
      ...(extra?.fileHash !== undefined ? { fileHash: extra.fileHash } : {}),
    })
    .where(eq(syncStates.source, "bdu"));
}

describe("TC-008 BDU upload fallback", () => {
  beforeEach(async () => {
    await resetBduIdle({ fileHash: null });
  });

  afterAll(async () => {
    await resetBduIdle();
  });

  it("viewer cannot upload → 403", async () => {
    getSessionMock.mockResolvedValue(sessionFor("viewer"));
    const form = new FormData();
    form.set(
      "file",
      new File([FIXTURE_XML], "bdu-mini.xml", { type: "application/xml" }),
    );
    const res = await postUpload(
      new Request("http://localhost/api/sync/bdu/upload", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("admin upload enqueues bdu-sync with uploadedPath (no live URL)", async () => {
    getSessionMock.mockResolvedValue(sessionFor("admin"));
    const form = new FormData();
    form.set(
      "file",
      new File([FIXTURE_XML], "bdu-mini.xml", { type: "application/xml" }),
    );
    form.set("force", "true");

    const res = await postUpload(
      new Request("http://localhost/api/sync/bdu/upload", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      jobId: string;
      uploadedPath: string;
    };
    expect(body.jobId).toBeTruthy();
    expect(body.uploadedPath).toContain("storage/bdu");
    expect(body.uploadedPath).toMatch(/upload-.*bdu-mini\.xml/);

    const job = await getBduQueue().getJob(body.jobId);
    expect(job).toBeTruthy();
    expect(job!.data.uploadedPath).toBe(body.uploadedPath);
    expect(job!.data.force).toBe(true);
    expect(job!.data.triggeredBy).toBe("test-admin");
  });

  it("runBduSync(upload) parses without external URL and sets file_hash", async () => {
    // Direct harness: same path the worker uses after upload enqueue.
    // Isolate from concurrent worker jobs by clearing hash + forcing.
    await resetBduIdle({ fileHash: null });
    const uploadedPath = FIXTURE_PATH;
    const first = await runBduSync({ uploadedPath, force: true });
    expect(first.mode).toBe("upload");
    expect(first.skippedUnchanged).toBe(false);
    expect(first.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.upserted).toBeGreaterThanOrEqual(1);

    // Re-read; worker may briefly flip status — fileHash is the contract signal.
    const [state] = await db
      .select()
      .from(syncStates)
      .where(eq(syncStates.source, "bdu"))
      .limit(1);
    expect(state.fileHash).toBe(first.fileHash);
    expect(state.lastSuccessAt).toBeInstanceOf(Date);
    expect(["succeeded", "running", "idle"]).toContain(state.status);

    const second = await runBduSync({ uploadedPath, force: false });
    expect(second.skippedUnchanged).toBe(true);
    expect(second.upserted).toBe(0);
    expect(second.fileHash).toBe(first.fileHash);
  });

  it("missing file field → 400", async () => {
    getSessionMock.mockResolvedValue(sessionFor("admin"));
    const res = await postUpload(
      new Request("http://localhost/api/sync/bdu/upload", {
        method: "POST",
        body: new FormData(),
      }),
    );
    expect(res.status).toBe(400);
  });
});
