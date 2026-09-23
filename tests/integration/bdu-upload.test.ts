import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { syncState, vulnerabilities } from "@/db/schema";
import { AuthError } from "@/lib/auth/rbac";
import {
  BduDownloadError,
  runBduSync,
  saveBduUpload,
} from "@/lib/sync/bdu";
import { createTestDb, truncateBduTables, type TestDb } from "./helpers/db";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/bdu-mini.xml");

describe("TC-008 BDU upload fallback", () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(() => {
    process.env.BDU_UPLOAD_DIR = resolve(
      process.cwd(),
      "storage",
      "bdu-uploads-test",
    );
    const handle = createTestDb();
    db = handle.db;
    close = handle.close;
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateBduTables(db);
  });

  it("marks SyncState error when download fails (upload fallback path)", async () => {
    await expect(
      runBduSync({
        mode: "download",
        db,
        downloadFn: async () => {
          throw new BduDownloadError("BDU download failed: HTTP 503", 503);
        },
      }),
    ).rejects.toBeInstanceOf(BduDownloadError);

    const [state] = await db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "bdu"));
    expect(state?.lastError).toMatch(/download failed/i);
    expect(state?.lastSuccessAt).toBeNull();
  });

  it("admin upload saves file, parses, upserts, updates SyncState; idempotent re-upload", async () => {
    const xml = readFileSync(FIXTURE, "utf8");
    const saved = await saveBduUpload(xml, "bdu-mini.xml");
    expect(saved.filePath).toContain("bdu-uploads-test");

    const first = await runBduSync({
      mode: "upload",
      filePath: saved.filePath,
      db,
      downloadFn: async () => {
        throw new Error("must not download during upload fallback");
      },
    });
    expect(first.stats.upserted).toBe(2);
    expect(first.fileHash).toBe(saved.fileHash);

    const second = await runBduSync({
      mode: "upload",
      xml,
      db,
    });
    expect(second.fileHash).toBe(first.fileHash);

    const rows = await db.select().from(vulnerabilities);
    const bduIds = rows.map((r) => r.bduId).filter(Boolean);
    expect(bduIds.filter((id) => id === "BDU:2024-00001")).toHaveLength(1);
    expect(bduIds.filter((id) => id === "BDU:2024-00002")).toHaveLength(1);

    const [state] = await db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "bdu"));
    expect(state?.cursor).toBe(first.fileHash);
    expect(state?.lastSuccessAt).toBeTruthy();
    expect((state?.meta as { mode?: string })?.mode).toBe("upload");
  });
});

describe("TC-008 upload HTTP RBAC", () => {
  it("viewer gets 403 and does not enqueue; admin gets 202", async () => {
    const enqueue = vi.fn(async () => ({ id: "job-1" }));
    const save = vi.fn(async () => ({
      filePath: "/tmp/bdu.xml",
      fileHash: "hash1",
    }));
    let roleGate: "viewer" | "admin" = "viewer";

    vi.doMock("@/lib/sync/bdu", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/sync/bdu")>();
      return {
        ...actual,
        enqueueBduSync: enqueue,
        saveBduUpload: save,
      };
    });

    vi.doMock("@/lib/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/auth")>();
      return {
        ...actual,
        requireRole: async () => {
          if (roleGate === "viewer") {
            throw new AuthError("Forbidden", 403);
          }
          return {
            session: { user: { id: "admin-1", role: "admin" } },
            role: "admin" as const,
          };
        },
      };
    });

    const { POST } = await import("@/app/api/settings/sync/bdu/upload/route");

    const makeReq = () => {
      const fd = new FormData();
      fd.set(
        "file",
        new File([readFileSync(FIXTURE)], "bdu-mini.xml", {
          type: "application/xml",
        }),
      );
      return new Request("http://localhost/api/settings/sync/bdu/upload", {
        method: "POST",
        body: fd,
      });
    };

    roleGate = "viewer";
    const viewerRes = await POST(makeReq());
    expect(viewerRes.status).toBe(403);
    expect(enqueue).not.toHaveBeenCalled();

    roleGate = "admin";
    const adminRes = await POST(makeReq());
    expect(adminRes.status).toBe(202);
    expect(save).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "upload",
        requestedByUserId: "admin-1",
      }),
    );

    vi.doUnmock("@/lib/sync/bdu");
    vi.doUnmock("@/lib/auth");
  });
});
