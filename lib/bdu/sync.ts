import { readFile } from "node:fs/promises";
import path from "node:path";
import { downloadBduXml } from "@/lib/bdu/download";
import { hashBuffer, parseBduXml } from "@/lib/bdu/parse";
import { upsertBduVulnerability } from "@/lib/bdu/upsert";
import { db, type Db } from "@/lib/db/client";
import {
  ensureSyncState,
  markSyncFailed,
  markSyncRunning,
  markSyncSucceeded,
} from "@/lib/sync/state";
import type { BduSyncJobData } from "@/lib/sync/types";

export type BduSyncResult = {
  upserted: number;
  inserted: number;
  updated: number;
  merged: number;
  skipped: number;
  mode: "live" | "fixture" | "upload";
  fileHash: string;
  skippedUnchanged: boolean;
};

function resolveMode(job: BduSyncJobData): "live" | "fixture" | "upload" {
  if (job.uploadedPath) return "upload";
  if (job.mode === "fixture") return "fixture";
  const env = process.env.BDU_SYNC_MODE?.trim().toLowerCase();
  if (env === "fixture") return "fixture";
  return "live";
}

function defaultFixturePath(): string {
  return path.join(process.cwd(), "tests/fixtures/bdu-mini.xml");
}

export async function runBduSync(
  job: BduSyncJobData = {},
  options: {
    database?: Db;
    fixturePath?: string;
    fetchFn?: typeof fetch;
  } = {},
): Promise<BduSyncResult> {
  const database = options.database ?? db;
  const mode = resolveMode(job);

  const prior = await ensureSyncState("bdu", database);
  const priorHash = prior.fileHash;

  await markSyncRunning("bdu", database);

  try {
    let xmlPath: string;

    if (mode === "upload" && job.uploadedPath) {
      xmlPath = job.uploadedPath;
    } else if (mode === "fixture") {
      xmlPath = options.fixturePath ?? defaultFixturePath();
    } else {
      const downloaded = await downloadBduXml({ fetchFn: options.fetchFn });
      xmlPath = downloaded.path;
    }

    const content = await readFile(xmlPath);
    const fileHash = hashBuffer(content);

    if (!job.force && priorHash && priorHash === fileHash) {
      await markSyncSucceeded(
        "bdu",
        {
          fileHash,
          metaJson: {
            skippedUnchanged: true,
            mode,
            path: xmlPath,
          },
        },
        database,
      );
      return {
        upserted: 0,
        inserted: 0,
        updated: 0,
        merged: 0,
        skipped: 0,
        mode,
        fileHash,
        skippedUnchanged: true,
      };
    }

    const { records, skipped } = parseBduXml(content.toString("utf8"));
    let upserted = 0;
    let inserted = 0;
    let updated = 0;
    let merged = 0;

    for (const record of records) {
      const result = await upsertBduVulnerability(record, database);
      upserted += 1;
      if (result.action === "inserted") inserted += 1;
      else if (result.action === "merged") merged += 1;
      else updated += 1;
    }

    await markSyncSucceeded(
      "bdu",
      {
        fileHash,
        metaJson: {
          upserted,
          inserted,
          updated,
          merged,
          skipped,
          mode,
          path: xmlPath,
        },
      },
      database,
    );

    return {
      upserted,
      inserted,
      updated,
      merged,
      skipped,
      mode,
      fileHash,
      skippedUnchanged: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markSyncFailed("bdu", message, database);
    throw err;
  }
}
