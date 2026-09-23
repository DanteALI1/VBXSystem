import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { syncState } from "@/db/schema";
import { logger } from "@/lib/logger";
import { createNvdClient, type NvdClient, type NvdClientOptions } from "./client";
import {
  formatNvdDate,
  getNvdConfig,
  windowStart,
} from "./config";
import { extractEnvelopes, parseNvdCve } from "./parse";
import type {
  NvdSyncJobPayload,
  NvdSyncMode,
  NvdSyncResult,
} from "./types";
import { upsertNvdVulnerability } from "./upsert";

export type RunNvdSyncOptions = {
  db: Db;
  payload?: NvdSyncJobPayload;
  client?: NvdClient;
  clientOptions?: NvdClientOptions;
  now?: Date;
};

async function markAttempt(db: Db, now: Date, error?: string) {
  await db
    .insert(syncState)
    .values({
      source: "nvd",
      lastAttemptAt: now,
      lastError: error ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncState.source,
      set: {
        lastAttemptAt: now,
        lastError: error ?? null,
        updatedAt: now,
      },
    });
}

async function markSuccess(
  db: Db,
  now: Date,
  cursor: string,
  meta: Record<string, unknown>,
) {
  await db
    .insert(syncState)
    .values({
      source: "nvd",
      lastSuccessAt: now,
      lastAttemptAt: now,
      lastError: null,
      cursor,
      meta,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncState.source,
      set: {
        lastSuccessAt: now,
        lastAttemptAt: now,
        lastError: null,
        cursor,
        meta,
        updatedAt: now,
      },
    });
}

async function markFailure(db: Db, now: Date, error: string) {
  await db
    .insert(syncState)
    .values({
      source: "nvd",
      lastAttemptAt: now,
      lastError: error,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncState.source,
      set: {
        lastAttemptAt: now,
        lastError: error,
        updatedAt: now,
      },
    });
}

function resolveWindow(
  payload: NvdSyncJobPayload | undefined,
  mode: NvdSyncMode,
  cursor: string | null | undefined,
  syncDays: number,
  now: Date,
): { lastModStartDate?: string; lastModEndDate?: string } {
  if (payload?.cveId) {
    return {};
  }

  if (payload?.lastModStartDate || payload?.lastModEndDate) {
    return {
      lastModStartDate: payload.lastModStartDate,
      lastModEndDate: payload.lastModEndDate ?? formatNvdDate(now),
    };
  }

  const end = formatNvdDate(now);

  if (mode === "incremental" && cursor) {
    return {
      lastModStartDate: cursor,
      lastModEndDate: end,
    };
  }

  // MVP: both full and incremental without cursor use NVD_SYNC_DAYS window
  return {
    lastModStartDate: formatNvdDate(windowStart(syncDays, now)),
    lastModEndDate: end,
  };
}

/**
 * Full/incremental NVD sync: paginate API → upsert → update SyncState.
 * HTTP client is injectable for tests (fixture / mock — never real NIST in Gate).
 */
export async function runNvdSync(
  options: RunNvdSyncOptions,
): Promise<NvdSyncResult> {
  const { db } = options;
  const now = options.now ?? new Date();
  const payload = options.payload ?? {};
  const mode: NvdSyncMode = payload.mode ?? "incremental";
  const config = getNvdConfig();
  const client =
    options.client ?? createNvdClient(options.clientOptions ?? {});

  await markAttempt(db, now);

  const [state] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.source, "nvd"))
    .limit(1);

  const window = resolveWindow(
    payload,
    mode,
    state?.cursor,
    client.config.syncDays ?? config.syncDays,
    now,
  );

  let upserted = 0;
  let unchanged = 0;
  let pages = 0;
  let startIndex = 0;
  const resultsPerPage = client.config.resultsPerPage;

  try {
    for (;;) {
      const page = await client.fetchPage({
        startIndex,
        resultsPerPage,
        cveId: payload.cveId,
        lastModStartDate: window.lastModStartDate,
        lastModEndDate: window.lastModEndDate,
      });

      pages += 1;
      const envelopes = extractEnvelopes(page);

      for (const env of envelopes) {
        if (!env.cve?.id) continue;
        const parsed = parseNvdCve(env.cve);
        const result = await upsertNvdVulnerability(db, parsed, now);
        if (result.changed || result.created) upserted += 1;
        else unchanged += 1;
      }

      const total = page.totalResults ?? envelopes.length;
      const nextIndex = startIndex + (page.resultsPerPage ?? resultsPerPage);
      if (envelopes.length === 0 || nextIndex >= total) {
        break;
      }
      startIndex = nextIndex;
    }

    const cursor = window.lastModEndDate ?? formatNvdDate(now);
    const meta = {
      upserted,
      unchanged,
      pages,
      mode,
      lastModStartDate: window.lastModStartDate,
      lastModEndDate: window.lastModEndDate,
      requestedByUserId: payload.requestedByUserId ?? null,
    };

    await markSuccess(db, now, cursor, meta);

    logger.info(
      { queue: "nvd-sync", ...meta },
      "nvd sync completed",
    );

    return {
      upserted,
      unchanged,
      pages,
      mode,
      lastModStartDate: window.lastModStartDate,
      lastModEndDate: window.lastModEndDate,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailure(db, now, message);
    logger.error({ err, queue: "nvd-sync" }, "nvd sync failed");
    throw err;
  }
}
