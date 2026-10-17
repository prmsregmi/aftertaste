import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  // Lets Fluid Compute close idle clients before an instance is suspended.
  attachDatabasePool(pool);
  return drizzle({ client: pool, schema });
}

let db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  db ??= createDb();
  return db;
}
