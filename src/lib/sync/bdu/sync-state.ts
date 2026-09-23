import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { syncState } from "@/db/schema";
import type { BduSyncMode, BduUpsertStats } from "./types";

export type BduSyncMeta = {
  fileHash?: string;
  mode?: BduSyncMode;
  upserted?: number;
  created?: number;
  updated?: number;
  linked?: number;
  skipped?: number;
  historyEntries?: number;
  sourceUrl?: string | null;
  uploadPath?: string | null;
};

async function getOrCreate(db: Db) {
  const [existing] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.source, "bdu"))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(syncState)
    .values({ source: "bdu", meta: {} })
    .returning();
  return created;
}

export async function markBduAttempt(db: Db): Promise<void> {
  const row = await getOrCreate(db);
  await db
    .update(syncState)
    .set({ lastAttemptAt: new Date(), updatedAt: new Date() })
    .where(eq(syncState.id, row.id));
}

export async function markBduFailure(db: Db, error: string): Promise<void> {
  const row = await getOrCreate(db);
  await db
    .update(syncState)
    .set({
      lastAttemptAt: new Date(),
      lastError: error.slice(0, 4000),
      updatedAt: new Date(),
    })
    .where(eq(syncState.id, row.id));
}

export async function markBduSuccess(
  db: Db,
  opts: {
    fileHash: string;
    mode: BduSyncMode;
    stats: BduUpsertStats;
    sourceUrl?: string | null;
    uploadPath?: string | null;
  },
): Promise<void> {
  const row = await getOrCreate(db);
  const prevMeta = (row.meta ?? {}) as BduSyncMeta;
  const meta: BduSyncMeta = {
    ...prevMeta,
    fileHash: opts.fileHash,
    mode: opts.mode,
    upserted: opts.stats.upserted,
    created: opts.stats.created,
    updated: opts.stats.updated,
    linked: opts.stats.linked,
    skipped: opts.stats.skipped,
    historyEntries: opts.stats.historyEntries,
    sourceUrl: opts.sourceUrl ?? null,
    uploadPath: opts.uploadPath ?? null,
  };
  const now = new Date();
  await db
    .update(syncState)
    .set({
      lastSuccessAt: now,
      lastAttemptAt: now,
      lastError: null,
      /** File content hash — SyncState keyed by hash for idempotent re-runs */
      cursor: opts.fileHash,
      meta,
      updatedAt: now,
    })
    .where(eq(syncState.id, row.id));
}

export async function getBduSyncState(db: Db) {
  return getOrCreate(db);
}
