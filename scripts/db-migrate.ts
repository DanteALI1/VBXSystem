import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";

async function main() {
  const url =
    process.env.DATABASE_URL ?? "postgresql://vuln:vuln@localhost:5432/vuln";
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await client.end();
  console.log("Migrations applied:", url.replace(/:[^:@]+@/, ":***@"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
