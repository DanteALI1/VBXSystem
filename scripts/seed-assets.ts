import { db } from "@/lib/db/client";
import { assets } from "@/db/schema";
import { eq } from "drizzle-orm";

const SEED = [
  {
    hostname: "web-01.lab.local",
    ip: "10.0.1.10",
    description: "Primary lab web host",
  },
  {
    hostname: "db-01.lab.local",
    ip: "10.0.1.20",
    description: "Lab database",
  },
  {
    hostname: "scanner.lab.local",
    ip: "10.0.2.5",
    description: "Internal scanner jump host",
  },
];

async function upsertAsset(seed: (typeof SEED)[number]) {
  const [existing] = await db
    .select()
    .from(assets)
    .where(eq(assets.hostname, seed.hostname))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(assets)
      .set({
        ip: seed.ip,
        description: seed.description,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, existing.id))
      .returning();
    return { action: "updated" as const, id: updated.id, hostname: seed.hostname };
  }

  const [inserted] = await db
    .insert(assets)
    .values(seed)
    .returning({ id: assets.id });
  return { action: "inserted" as const, id: inserted.id, hostname: seed.hostname };
}

async function main() {
  console.log(`Seeding ${SEED.length} assets…`);
  for (const seed of SEED) {
    const result = await upsertAsset(seed);
    console.log(`  ${result.action}: ${result.id} ${result.hostname}`);
  }
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
