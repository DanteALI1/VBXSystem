import { NextResponse } from "next/server";
import type { SyncState } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import {
  BDU_QUEUE_NAME,
  NVD_QUEUE_NAME,
  ensureSyncState,
  getRecentJobInfo,
} from "@/lib/sync";

function serializeState(row: SyncState) {
  return {
    source: row.source,
    status: row.status,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    cursor: row.cursor,
    fileHash: row.fileHash,
    metaJson: row.metaJson,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [nvd, bdu] = await Promise.all([
    ensureSyncState("nvd"),
    ensureSyncState("bdu"),
  ]);

  let nvdJob = null;
  let bduJob = null;
  try {
    [nvdJob, bduJob] = await Promise.all([
      getRecentJobInfo(NVD_QUEUE_NAME),
      getRecentJobInfo(BDU_QUEUE_NAME),
    ]);
  } catch {
    // Redis may be unavailable in some envs — still return SyncState
  }

  return NextResponse.json({
    nvd: serializeState(nvd),
    bdu: serializeState(bdu),
    jobs: {
      nvd: nvdJob,
      bdu: bduJob,
    },
  });
}
