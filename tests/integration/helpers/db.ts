import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Isolated Drizzle client for integration tests (DATABASE_URL_TEST).
 * Does not reuse the app singleton so env can point at vuln_test.
 */
export function createTestDb() {
  const url =
    process.env.DATABASE_URL_TEST ??
    "postgresql://vuln:vuln@localhost:5432/vuln_test";
  const client = postgres(url, { max: 5 });
  const db = drizzle(client, { schema });
  return {
    db,
    async close() {
      await client.end({ timeout: 5 });
    },
  };
}

export async function truncateBduTables(db: TestDb) {
  await db.execute(sql`
    TRUNCATE TABLE
      vulnerability_history,
      vulnerability_sources,
      vulnerability_tag_links,
      vulnerabilities,
      sync_state
    RESTART IDENTITY CASCADE
  `);
}
