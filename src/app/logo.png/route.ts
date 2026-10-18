import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-static";

export function GET() {
  const png = readFileSync(join(process.cwd(), "public/logo.png"));
  return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
}
