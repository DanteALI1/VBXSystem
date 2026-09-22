import { readFile } from "node:fs/promises";
import path from "node:path";
import { mapNvdCveItem, type NvdApiResponse } from "@/lib/nvd/map";
import { NvdClient, formatNvdDate } from "@/lib/nvd/client";
import { upsertNvdVulnerability } from "@/lib/nvd/upsert";
import {
  markSyncFailed,
  markSyncRunning,
  markSyncSucceeded,
} from "@/lib/sync/state";
import type { NvdSyncJobData } from "@/lib/sync/types";
import type { Db } from "@/lib/db/client";
import { db } from "@/lib/db/client";

export type NvdSyncResult = {
  upserted: number;
  inserted: number;
  updated: number;
  pages: number;
  mode: "live" | "fixture";
  window?: { start: string; end: string };
};

function resolveSyncDays(override?: number): number {
  if (override != null && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const fromEnv = Number(process.env.NVD_SYNC_DAYS ?? "30");
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 30;
}

function resolveMode(job: NvdSyncJobData): "live" | "fixture" {
  if (job.mode === "fixture" || job.mode === "live") return job.mode;
  const env = process.env.NVD_SYNC_MODE?.trim().toLowerCase();
  if (env === "fixture") return "fixture";
  return "live";
}

function defaultFixturePath(): string {
  return path.join(process.cwd(), "tests/fixtures/nvd-fragment.json");
}

async function loadFixture(filePath?: string): Promise<NvdApiResponse> {
  const resolved = filePath ?? defaultFixturePath();
  const raw = await readFile(resolved, "utf8");
  return JSON.parse(raw) as NvdApiResponse;
}

async function processPage(
  page: NvdApiResponse,
  database: Db,
): Promise<{ upserted: number; inserted: number; updated: number }> {
  let upserted = 0;
  let inserted = 0;
  let updated = 0;

  for (const item of page.vulnerabilities ?? []) {
    const mapped = mapNvdCveItem(item);
    if (!mapped) continue;
    const result = await upsertNvdVulnerability(mapped, database);
    upserted += 1;
    if (result.action === "inserted") inserted += 1;
    else updated += 1;
  }

  return { upserted, inserted, updated };
}

export async function runNvdSync(
  job: NvdSyncJobData = {},
  options: {
    database?: Db;
    client?: NvdClient;
    fixturePath?: string;
  } = {},
): Promise<NvdSyncResult> {
  const database = options.database ?? db;
  const mode = resolveMode(job);

  await markSyncRunning("nvd", database);

  try {
    let upserted = 0;
    let inserted = 0;
    let updated = 0;
    let pages = 0;
    let window: NvdSyncResult["window"];

    if (mode === "fixture") {
      const page = await loadFixture(options.fixturePath);
      pages = 1;
      const stats = await processPage(page, database);
      upserted = stats.upserted;
      inserted = stats.inserted;
      updated = stats.updated;
    } else {
      const days = resolveSyncDays(job.days);
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      const lastModStartDate = formatNvdDate(start);
      const lastModEndDate = formatNvdDate(end);
      window = { start: lastModStartDate, end: lastModEndDate };

      const client =
        options.client ??
        new NvdClient({
          apiKey: process.env.NVD_API_KEY,
        });

      for await (const page of client.paginate({
        lastModStartDate,
        lastModEndDate,
        resultsPerPage: 2000,
      })) {
        pages += 1;
        const stats = await processPage(page, database);
        upserted += stats.upserted;
        inserted += stats.inserted;
        updated += stats.updated;
      }
    }

    await markSyncSucceeded(
      "nvd",
      {
        cursor: window?.end ?? new Date().toISOString(),
        metaJson: {
          upserted,
          inserted,
          updated,
          pages,
          mode,
          window: window ?? null,
        },
      },
      database,
    );

    return { upserted, inserted, updated, pages, mode, window };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markSyncFailed("nvd", message, database);
    throw err;
  }
}
