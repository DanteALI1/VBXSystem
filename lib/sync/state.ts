import { eq } from "drizzle-orm";
import {
  syncStates,
  type SyncState,
  type VulnSource,
} from "@/db/schema";
import { db, type Db } from "@/lib/db/client";

export async function ensureSyncState(
  source: VulnSource,
  database: Db = db,
): Promise<SyncState> {
  const [existing] = await database
    .select()
    .from(syncStates)
    .where(eq(syncStates.source, source))
    .limit(1);

  if (existing) return existing;

  const [created] = await database
    .insert(syncStates)
    .values({ source, status: "idle" })
    .returning();

  return created;
}

export async function markSyncRunning(
  source: VulnSource,
  database: Db = db,
): Promise<SyncState> {
  await ensureSyncState(source, database);
  const now = new Date();
  const [updated] = await database
    .update(syncStates)
    .set({
      status: "running",
      lastSyncAt: now,
    })
    .where(eq(syncStates.source, source))
    .returning();
  return updated;
}

export async function markSyncSucceeded(
  source: VulnSource,
  patch: {
    cursor?: string | null;
    token?: string | null;
    fileHash?: string | null;
    metaJson?: Record<string, unknown> | null;
  } = {},
  database: Db = db,
): Promise<SyncState> {
  const now = new Date();
  const [updated] = await database
    .update(syncStates)
    .set({
      status: "succeeded",
      lastSyncAt: now,
      lastSuccessAt: now,
      cursor: patch.cursor === undefined ? undefined : patch.cursor,
      token: patch.token === undefined ? undefined : patch.token,
      fileHash: patch.fileHash === undefined ? undefined : patch.fileHash,
      metaJson: patch.metaJson === undefined ? undefined : patch.metaJson,
    })
    .where(eq(syncStates.source, source))
    .returning();
  return updated;
}

export async function markSyncFailed(
  source: VulnSource,
  error: string,
  database: Db = db,
): Promise<SyncState> {
  const now = new Date();
  const existing = await ensureSyncState(source, database);
  const prevMeta =
    existing.metaJson && typeof existing.metaJson === "object"
      ? (existing.metaJson as Record<string, unknown>)
      : {};

  const [updated] = await database
    .update(syncStates)
    .set({
      status: "failed",
      lastSyncAt: now,
      metaJson: { ...prevMeta, lastError: error },
    })
    .where(eq(syncStates.source, source))
    .returning();
  return updated;
}

export async function getSyncStates(database: Db = db): Promise<{
  nvd: SyncState | null;
  bdu: SyncState | null;
}> {
  const rows = await database.select().from(syncStates);
  return {
    nvd: rows.find((r) => r.source === "nvd") ?? null,
    bdu: rows.find((r) => r.source === "bdu") ?? null,
  };
}
