import { SUPABASE_CA } from "./supabase-ca";

// Connection fields for pg and drizzle-kit. Supabase's pooler certificate chains to a private root
// CA, so that CA is pinned; a URL sslmode would override it, which is why the URL isn't passed as-is.
export function pgConfig(connectionString: string) {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    database: url.pathname.slice(1),
    ssl: url.hostname.endsWith(".pooler.supabase.com") ? { ca: SUPABASE_CA } : undefined,
  };
}
