import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://vuln:vuln@localhost:5432/vuln";

const client = postgres(connectionString);

export const db = drizzle(client, { schema });

export type Db = typeof db;
