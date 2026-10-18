import { readFileSync } from "fs";
import { join } from "path";


export function GET() {
  const svg = readFileSync(join(process.cwd(), "public/logo.svg"));
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" } });
}
