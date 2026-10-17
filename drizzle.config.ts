import { defineConfig } from "drizzle-kit";
import { pgConfig } from "./src/db/connection";

// Supabase's session pooler for DDL; DATABASE_URL for local Postgres. `generate` needs neither.
const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: url ? pgConfig(url) : { url: "" },
});
