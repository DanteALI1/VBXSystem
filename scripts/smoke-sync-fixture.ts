import { eq } from "drizzle-orm";
import { vulnerabilities, syncStates } from "@/db/schema";
import { db } from "@/lib/db/client";
import { enqueueBduSync, enqueueNvdSync } from "@/lib/sync/queues";

async function main() {
  const n = await enqueueNvdSync({ mode: "fixture", force: true });
  const b = await enqueueBduSync({ mode: "fixture", force: true });
  console.log("enqueued", n, b);

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const states = await db.select().from(syncStates);
    const nvd = states.find((s) => s.source === "nvd");
    const bdu = states.find((s) => s.source === "bdu");
    console.log(`tick ${i}`, { nvd: nvd?.status, bdu: bdu?.status });
    if (
      (nvd?.status === "succeeded" || nvd?.status === "failed") &&
      (bdu?.status === "succeeded" || bdu?.status === "failed")
    ) {
      break;
    }
  }

  const rows = await db
    .select({
      cveId: vulnerabilities.cveId,
      bduId: vulnerabilities.bduId,
      title: vulnerabilities.title,
    })
    .from(vulnerabilities)
    .where(eq(vulnerabilities.cveId, "CVE-2099-0001"));

  const bduOnly = await db
    .select({
      cveId: vulnerabilities.cveId,
      bduId: vulnerabilities.bduId,
    })
    .from(vulnerabilities)
    .where(eq(vulnerabilities.bduId, "BDU:2099-00002"));

  const linked = await db
    .select({
      cveId: vulnerabilities.cveId,
      bduId: vulnerabilities.bduId,
    })
    .from(vulnerabilities)
    .where(eq(vulnerabilities.bduId, "BDU:2099-00001"));

  console.log("CVE-2099-0001", rows);
  console.log("BDU:2099-00002", bduOnly);
  console.log("BDU:2099-00001", linked);

  const states = await db.select().from(syncStates);
  console.log(
    "syncStates",
    states.map((s) => ({
      source: s.source,
      status: s.status,
      fileHash: s.fileHash?.slice(0, 12),
      meta: s.metaJson,
    })),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
