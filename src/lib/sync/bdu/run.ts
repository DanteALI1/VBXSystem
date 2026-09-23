import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/db";
import { db as defaultDb } from "@/db";
import { logger } from "@/lib/logger";
import { BduDownloadError, downloadBduXml } from "./download";
import { sha256Hex } from "./hash";
import { parseBduXml } from "./parse";
import {
  getBduSyncState,
  markBduAttempt,
  markBduFailure,
  markBduSuccess,
} from "./sync-state";
import type { BduSyncJobPayload, BduSyncResult } from "./types";
import { upsertBduRecords } from "./upsert";

export function resolveBduUploadDir(): string {
  return (
    process.env.BDU_UPLOAD_DIR?.trim() ||
    path.join(process.cwd(), "storage", "bdu-uploads")
  );
}

export async function saveBduUpload(
  content: Buffer | string,
  originalName = "upload.xml",
): Promise<{ filePath: string; fileHash: string }> {
  const dir = resolveBduUploadDir();
  await mkdir(dir, { recursive: true });
  const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const fileHash = sha256Hex(buffer);
  const safeBase = path
    .basename(originalName)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  const filePath = path.join(dir, `${fileHash.slice(0, 16)}-${safeBase || "bdu.xml"}`);
  await writeFile(filePath, buffer);
  return { filePath, fileHash };
}

export type RunBduSyncOptions = BduSyncJobPayload & {
  db?: Db;
  /** Injected download for tests — never call real BDU_XML_URL in CI */
  downloadFn?: typeof downloadBduXml;
  /** When true, skip upsert if SyncState.cursor already equals file hash */
  skipIfUnchanged?: boolean;
};

/**
 * Full BDU sync pipeline: obtain XML → hash → parse → upsert → SyncState.
 * Download failures surface as BduDownloadError (admin upload fallback).
 */
export async function runBduSync(
  options: RunBduSyncOptions,
): Promise<BduSyncResult> {
  const database = options.db ?? defaultDb;
  const mode = options.mode;
  await markBduAttempt(database);

  let xml: string;
  let sourceUrl: string | null = null;
  let uploadPath: string | null = options.filePath ?? null;

  try {
    if (mode === "upload") {
      if (options.xml) {
        xml = options.xml;
      } else if (options.filePath) {
        xml = await readFile(options.filePath, "utf8");
        uploadPath = options.filePath;
      } else {
        throw new Error("BDU upload mode requires xml or filePath");
      }
    } else {
      const downloadFn = options.downloadFn ?? downloadBduXml;
      try {
        const downloaded = await downloadFn();
        xml = downloaded.xml;
        sourceUrl = downloaded.url;
      } catch (err) {
        const message =
          err instanceof BduDownloadError
            ? err.message
            : `BDU download failed: ${err instanceof Error ? err.message : String(err)}`;
        await markBduFailure(database, message);
        throw err instanceof BduDownloadError
          ? err
          : new BduDownloadError(message, undefined, err);
      }
    }

    const fileHash = sha256Hex(xml);
    const state = await getBduSyncState(database);
    const skipIfUnchanged = options.skipIfUnchanged ?? false;
    if (
      !options.force &&
      skipIfUnchanged &&
      state.cursor === fileHash
    ) {
      await markBduSuccess(database, {
        fileHash,
        mode,
        stats: {
          upserted: 0,
          created: 0,
          updated: 0,
          linked: 0,
          skipped: 0,
          historyEntries: 0,
        },
        sourceUrl,
        uploadPath,
      });
      return {
        mode,
        fileHash,
        skippedUnchanged: true,
        stats: {
          upserted: 0,
          created: 0,
          updated: 0,
          linked: 0,
          skipped: 0,
          historyEntries: 0,
        },
      };
    }

    const { records, skipped: parseSkipped } = parseBduXml(xml);
    const stats = await upsertBduRecords(database, records);
    stats.skipped += parseSkipped;

    await markBduSuccess(database, {
      fileHash,
      mode,
      stats,
      sourceUrl,
      uploadPath,
    });

    logger.info(
      {
        mode,
        fileHash: fileHash.slice(0, 12),
        upserted: stats.upserted,
        linked: stats.linked,
        skipped: stats.skipped,
      },
      "bdu sync completed",
    );

    return { mode, fileHash, skippedUnchanged: false, stats };
  } catch (err) {
    if (!(err instanceof BduDownloadError)) {
      const message = err instanceof Error ? err.message : String(err);
      await markBduFailure(database, message);
    }
    throw err;
  }
}
